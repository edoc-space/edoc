<?php

declare(strict_types=1);

namespace App\Feature\Content;

use PhpSoftBox\Markdown\DefaultMarkdownSlugger;

use function array_key_exists;
use function preg_match;
use function preg_replace;
use function preg_split;
use function str_starts_with;
use function strlen;
use function trim;

/** The shared MDX heading contract used by docs and blog; no MDX execution. */
final readonly class MdxTableOfContents
{
    public function __construct(
        private DefaultMarkdownSlugger $slugger = new DefaultMarkdownSlugger(),
    ) {
    }

    /**
     * @return list<array{level:int,title:string,id:string}>
     */
    public function extract(string $source): array
    {
        $toc         = [];
        $ids         = [];
        $insideFence = false;
        $fence       = '';
        $lines       = preg_split('~\R~u', $this->stripFrontMatter($source)) ?: [];

        foreach ($lines as $line) {
            if (preg_match('#^\s{0,3}(`{3,}|~{3,})#', $line, $matches) === 1) {
                if (!$insideFence) {
                    $insideFence = true;
                    $fence       = $matches[1];
                } elseif (str_starts_with(trim($line), $fence)) {
                    $insideFence = false;
                    $fence       = '';
                }

                continue;
            }

            if ($insideFence) {
                continue;
            }

            if (preg_match('~^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$~u', $line, $matches) !== 1) {
                continue;
            }

            $title = $this->plainHeadingTitle($matches[2]);
            if ($title === '') {
                continue;
            }

            $baseId = $this->slugger->slug($title);
            $id     = $baseId;
            if (array_key_exists($baseId, $ids)) {
                $ids[$baseId]++;
                $id = $baseId . '-' . $ids[$baseId];
            } else {
                $ids[$baseId] = 1;
            }

            $level = strlen($matches[1]);
            if ($level < 2 || $level > 3) {
                continue;
            }

            $toc[] = [
                'level' => $level,
                'title' => $title,
                'id'    => $id,
            ];
        }

        return $toc;
    }

    private function stripFrontMatter(string $source): string
    {
        if (preg_match('~\A---[ \t]*\R.*?\R---[ \t]*(?:\R|$)~su', $source, $matches) !== 1) {
            return $source;
        }

        return (string) preg_replace('~\A---[ \t]*\R.*?\R---[ \t]*(?:\R|$)~su', '', $source, 1);
    }

    private function plainHeadingTitle(string $title): string
    {
        $title = (string) preg_replace('~!\[([^\]]*)]\([^)]+\)~u', '$1', $title);
        $title = (string) preg_replace('~\[([^\]]+)]\([^)]+\)~u', '$1', $title);
        $title = (string) preg_replace('~`([^`]*)`~u', '$1', $title);
        $title = (string) preg_replace('~<[^>]+>~u', '', $title);
        $title = (string) preg_replace('#[*_~]+#u', '', $title);
        $title = (string) preg_replace('~\s+~u', ' ', $title);

        return trim($title);
    }

}
