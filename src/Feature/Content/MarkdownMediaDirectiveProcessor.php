<?php

declare(strict_types=1);

namespace App\Feature\Content;

use function array_slice;
use function array_unshift;
use function count;
use function end;
use function explode;
use function html_entity_decode;
use function htmlspecialchars;
use function implode;
use function is_array;
use function is_scalar;
use function is_string;
use function parse_str;
use function parse_url;
use function preg_match;
use function preg_split;
use function rawurlencode;
use function sha1;
use function str_ends_with;
use function str_replace;
use function strlen;
use function strtolower;
use function substr;
use function trim;

use const ENT_QUOTES;
use const ENT_SUBSTITUTE;

final readonly class MarkdownMediaDirectiveProcessor
{
    /**
     * @return array{
     *     source:string,
     *     galleries:list<array{start:string,end:string,id:string}>,
     *     videos:list<array{token:string,html:string}>
     * }
     */
    public function prepare(string $source): array
    {
        $lines     = preg_split('/\R/u', $source);
        $lines     = $lines === false ? [$source] : $lines;
        $output    = [];
        $galleries = [];
        $videos    = [];
        $prefix    = 'EDOCMEDIADIRECTIVE' . substr(sha1($source), 0, 12);

        for ($index = 0, $count = count($lines); $index < $count; $index++) {
            $line = $lines[$index];

            if (preg_match('/^:{3,}\s*gallery(?:\s+([A-Za-z0-9][A-Za-z0-9_.:-]*))?\s*$/i', $line, $matches) === 1) {
                $galleryId = $matches[1] ?? '';
                $endIndex  = $this->findDirectiveEnd($lines, $index + 1);

                if ($galleryId !== '' && $endIndex !== null) {
                    $directiveIndex = count($galleries);
                    $startToken     = $prefix . 'GALLERYSTART' . $directiveIndex;
                    $endToken       = $prefix . 'GALLERYEND' . $directiveIndex;
                    $content        = array_slice($lines, $index + 1, $endIndex - $index - 1);

                    $this->appendSeparatedBlock($output, [$startToken, '', ...$content, '', $endToken]);

                    $galleries[] = [
                        'start' => $startToken,
                        'end'   => $endToken,
                        'id'    => $galleryId,
                    ];

                    $index = $endIndex;
                    continue;
                }
            }

            if (preg_match('/^:{3,}\s*video(?:\s+([A-Za-z0-9_-]+))?(?:\s+(.+?))?\s*$/i', $line, $matches) === 1) {
                $provider = strtolower($matches[1] ?? '');
                $inline   = trim($matches[2] ?? '');
                $endIndex = $this->findDirectiveEnd($lines, $index + 1);

                if ($provider !== '' && $endIndex !== null) {
                    $content = array_slice($lines, $index + 1, $endIndex - $index - 1);

                    if ($inline !== '') {
                        array_unshift($content, $inline);
                    }

                    $videoHtml = $this->renderVideo($provider, $content);

                    if ($videoHtml !== null) {
                        $directiveIndex = count($videos);
                        $token          = $prefix . 'VIDEO' . $directiveIndex;

                        $this->appendSeparatedBlock($output, [$token]);

                        $videos[] = [
                            'token' => $token,
                            'html'  => $videoHtml,
                        ];

                        $index = $endIndex;
                        continue;
                    }
                }
            }

            $output[] = $line;
        }

        return [
            'source'    => implode("\n", $output),
            'galleries' => $galleries,
            'videos'    => $videos,
        ];
    }

    /**
     * @param array{
     *     galleries:list<array{start:string,end:string,id:string}>,
     *     videos:list<array{token:string,html:string}>
     * } $directives
     */
    public function apply(string $html, array $directives): string
    {
        foreach ($directives['galleries'] as $gallery) {
            $galleryId = $this->escape($gallery['id']);
            $html      = str_replace('<p>' . $gallery['start'] . '</p>', '<div class="markdown-gallery" data-gallery="' . $galleryId . '">', $html);
            $html      = str_replace('<p>' . $gallery['end'] . '</p>', '</div>', $html);
        }

        foreach ($directives['videos'] as $video) {
            $html = str_replace('<p>' . $video['token'] . '</p>', $video['html'], $html);
        }

        return $html;
    }

    /**
     * @param list<string> $lines
     */
    private function findDirectiveEnd(array $lines, int $from): ?int
    {
        for ($index = $from, $count = count($lines); $index < $count; $index++) {
            if (preg_match('/^:{3,}\s*$/', $lines[$index]) === 1) {
                return $index;
            }
        }

        return null;
    }

    /**
     * @param list<string> $output
     * @param list<string> $block
     */
    private function appendSeparatedBlock(array &$output, array $block): void
    {
        if ($output !== [] && end($output) !== '') {
            $output[] = '';
        }

        foreach ($block as $line) {
            $output[] = $line;
        }

        if (end($output) !== '') {
            $output[] = '';
        }
    }

    /**
     * @param list<string> $lines
     */
    private function renderVideo(string $provider, array $lines): ?string
    {
        $source = '';
        $title  = '';
        $hash   = '';

        foreach ($lines as $line) {
            $line = trim($line);

            if ($line === '') {
                continue;
            }

            if (preg_match('/^(?:title|caption)\s*[:=]\s*(.+)$/i', $line, $matches) === 1) {
                $title = $this->stripQuotes(trim($matches[1]));
                continue;
            }

            if (preg_match('/^hash\s*[:=]\s*(.+)$/i', $line, $matches) === 1) {
                $hash = $this->stripQuotes(trim($matches[1]));
                continue;
            }

            if ($source === '') {
                $source = $this->extractIframeSource($line) ?? $line;
            }
        }

        if ($source === '') {
            return null;
        }

        $embed = match ($provider) {
            'youtube'       => $this->youtubeEmbed($source),
            'rutube'        => $this->rutubeEmbed($source),
            'vkvideo', 'vk' => $this->vkVideoEmbed($source, $hash),
            default         => null,
        };

        if ($embed === null) {
            if ($provider === 'vkvideo' || $provider === 'vk') {
                return $this->renderVideoExternalLink('vkvideo', $source, $title !== '' ? $title : 'VK Video');
            }

            return null;
        }

        $label        = $title !== '' ? $title : $embed['title'];
        $captionHtml  = $title !== '' ? '<figcaption class="docs-video__caption">' . $this->escape($title) . '</figcaption>' : '';
        $providerName = $this->escape($embed['provider']);
        $providerText = $this->escape($this->providerLabel($embed['provider']));

        return '<figure class="docs-video markdown-video" data-provider="' . $providerName . '" data-video-src="' . $this->escape($embed['src']) . '" data-video-title="' . $this->escape($label) . '">'
            . '<div class="docs-video__frame">'
            . '<button type="button" class="docs-video__load" aria-label="Загрузить видео: ' . $this->escape($label) . '">'
            . '<span class="docs-video__load-provider">' . $providerText . '</span>'
            . '<span class="docs-video__load-title">' . $this->escape($label) . '</span>'
            . '<span class="docs-video__load-action">Загрузить видео</span>'
            . '</button>'
            . '</div>'
            . $captionHtml
            . '</figure>';
    }

    /**
     * @return ?array{provider:string,src:string,title:string}
     */
    private function youtubeEmbed(string $source): ?array
    {
        $id = null;

        if (preg_match('/^[A-Za-z0-9_-]{6,}$/', $source) === 1) {
            $id = $source;
        }

        $parts = parse_url($source);

        if ($id === null && is_array($parts)) {
            $host = strtolower((string) ($parts['host'] ?? ''));
            $path = trim((string) ($parts['path'] ?? ''), '/');

            if ($this->hostMatches($host, 'youtu.be') && $path !== '') {
                $id = explode('/', $path)[0] ?? null;
            }

            if ($id === null && $this->hostMatches($host, 'youtube.com')) {
                parse_str((string) ($parts['query'] ?? ''), $query);

                if (isset($query['v']) && is_string($query['v'])) {
                    $id = $query['v'];
                } elseif (preg_match('~^(?:embed|shorts)/([^/?#]+)~', $path, $matches) === 1) {
                    $id = $matches[1];
                }
            }
        }

        if ($id === null || preg_match('/^[A-Za-z0-9_-]{6,}$/', $id) !== 1) {
            return null;
        }

        return [
            'provider' => 'youtube',
            'src'      => 'https://www.youtube-nocookie.com/embed/' . rawurlencode($id),
            'title'    => 'YouTube video',
        ];
    }

    /**
     * @return ?array{provider:string,src:string,title:string}
     */
    private function rutubeEmbed(string $source): ?array
    {
        $id = null;

        if (preg_match('/^[A-Za-z0-9_-]{8,}$/', $source) === 1) {
            $id = $source;
        }

        $parts = parse_url($source);

        if ($id === null && is_array($parts)) {
            $host = strtolower((string) ($parts['host'] ?? ''));

            if (!$this->hostMatches($host, 'rutube.ru')) {
                return null;
            }

            $path     = trim((string) ($parts['path'] ?? ''), '/');
            $segments = $path === '' ? [] : explode('/', $path);

            if (($segments[0] ?? '') === 'video' && isset($segments[1])) {
                $id = $segments[1];
            } elseif (($segments[0] ?? '') === 'play' && ($segments[1] ?? '') === 'embed' && isset($segments[2])) {
                $id = $segments[2];
            } elseif (($segments[0] ?? '') === 'shorts' && isset($segments[1])) {
                $id = $segments[1];
            }
        }

        if ($id === null || preg_match('/^[A-Za-z0-9_-]{8,}$/', $id) !== 1) {
            return null;
        }

        return [
            'provider' => 'rutube',
            'src'      => 'https://rutube.ru/play/embed/' . rawurlencode($id),
            'title'    => 'RuTube video',
        ];
    }

    /**
     * @return ?array{provider:string,src:string,title:string}
     */
    private function vkVideoEmbed(string $source, string $hash = ''): ?array
    {
        $oid              = null;
        $id               = null;
        $hd               = '';
        $explicitEmbedUrl = false;

        if (preg_match('/^(?:video)?(-?\d+)_(\d+)$/', $source, $matches) === 1) {
            $oid = $matches[1];
            $id  = $matches[2];
        }

        $parts = parse_url($source);

        if (($oid === null || $id === null) && is_array($parts)) {
            $host = strtolower((string) ($parts['host'] ?? ''));

            if (!$this->hostMatches($host, 'vk.com') && !$this->hostMatches($host, 'vkvideo.ru')) {
                return null;
            }

            parse_str((string) ($parts['query'] ?? ''), $query);
            $path = trim((string) ($parts['path'] ?? ''), '/');

            if ($path === 'video_ext.php') {
                $explicitEmbedUrl = true;
            }

            if (isset($query['oid'], $query['id']) && is_scalar($query['oid']) && is_scalar($query['id'])) {
                $oid = (string) $query['oid'];
                $id  = (string) $query['id'];
                if ($hash === '' && isset($query['hash']) && is_scalar($query['hash'])) {
                    $hash = (string) $query['hash'];
                }
                if (isset($query['hd']) && is_scalar($query['hd'])) {
                    $hd = (string) $query['hd'];
                }
            } else {
                if (preg_match('/(?:^|\/)video(-?\d+)_(\d+)/', $path, $matches) === 1) {
                    $oid = $matches[1];
                    $id  = $matches[2];
                }
            }
        }

        if ($oid === null || $id === null || preg_match('/^-?\d+$/', $oid) !== 1 || preg_match('/^\d+$/', $id) !== 1) {
            return null;
        }

        if ($hash !== '' && preg_match('/^[A-Za-z0-9_.-]{4,}$/', $hash) !== 1) {
            return null;
        }

        if ($hd !== '' && preg_match('/^[0-9]$/', $hd) !== 1) {
            return null;
        }

        if (!$explicitEmbedUrl && $hash === '') {
            return null;
        }

        $query = [
            'oid=' . rawurlencode($oid),
            'id=' . rawurlencode($id),
        ];

        if ($hash !== '') {
            $query[] = 'hash=' . rawurlencode($hash);
        }

        if ($hd !== '') {
            $query[] = 'hd=' . rawurlencode($hd);
        }

        return [
            'provider' => 'vkvideo',
            'src'      => 'https://vkvideo.ru/video_ext.php?' . implode('&', $query),
            'title'    => 'VK Video',
        ];
    }

    private function renderVideoExternalLink(string $provider, string $href, string $title): string
    {
        $providerName = $this->escape($provider);
        $providerText = $this->escape($this->providerLabel($provider));

        return '<figure class="docs-video markdown-video docs-video--external" data-provider="' . $providerName . '">'
            . '<div class="docs-video__frame">'
            . '<a class="docs-video__external" href="' . $this->escape($href) . '" target="_blank" rel="nofollow noopener noreferrer">'
            . '<span class="docs-video__load-provider">' . $providerText . '</span>'
            . '<span class="docs-video__load-title">' . $this->escape($title) . '</span>'
            . '<span class="docs-video__load-action">Открыть видео</span>'
            . '</a>'
            . '</div>'
            . '<figcaption class="docs-video__caption">Для встраивания VK Video используйте src из iframe, который VK показывает в "Поделиться" / "Вставить".</figcaption>'
            . '</figure>';
    }

    private function extractIframeSource(string $value): ?string
    {
        if (preg_match('/<iframe\b[^>]*\bsrc=(["\'])(.*?)\1/i', $value, $matches) !== 1) {
            return null;
        }

        return html_entity_decode($matches[2], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private function stripQuotes(string $value): string
    {
        if (strlen($value) < 2) {
            return $value;
        }

        $first = $value[0];
        $last  = $value[strlen($value) - 1];

        if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
            return substr($value, 1, -1);
        }

        return $value;
    }

    private function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private function providerLabel(string $provider): string
    {
        return match ($provider) {
            'youtube' => 'YouTube',
            'rutube'  => 'RuTube',
            'vkvideo' => 'VK Video',
            default   => 'Video',
        };
    }

    private function hostMatches(string $host, string $expected): bool
    {
        return $host === $expected || str_ends_with($host, '.' . $expected);
    }
}
