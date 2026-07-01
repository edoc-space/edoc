<?php

declare(strict_types=1);

use PhpSoftBox\Vite\Vite;

/** @var array $page */
/** @var string $rootId */
/** @var Vite|null $vite */
/** @var array|null $ssr */

$pageJsonRaw = json_encode(
    $page,
    JSON_THROW_ON_ERROR
    | JSON_UNESCAPED_SLASHES
    | JSON_HEX_TAG
    | JSON_HEX_AMP
    | JSON_HEX_APOS
    | JSON_HEX_QUOT,
);
$pageJson = htmlspecialchars($pageJsonRaw, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$rootId = htmlspecialchars($rootId, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

$props = is_array($page['props'] ?? null) ? $page['props'] : [];
$meta = is_array($props['meta'] ?? null) ? $props['meta'] : [];

$ssrData = is_array($ssr ?? null) ? $ssr : [];
$ssrHead = is_array($ssrData['head'] ?? null) ? $ssrData['head'] : [];
$ssrBody = is_string($ssrData['body'] ?? null) ? $ssrData['body'] : null;
$hasSsr = $ssrHead !== [] || $ssrBody !== null;

$title = is_string($meta['title'] ?? null) && $meta['title'] !== ''
    ? (string) $meta['title']
    : (is_string($props['title'] ?? null) ? (string) $props['title'] : null);

$description = is_string($meta['description'] ?? null) && $meta['description'] !== ''
    ? (string) $meta['description']
    : null;

$canonical = is_string($meta['canonical'] ?? null) && $meta['canonical'] !== ''
    ? (string) $meta['canonical']
    : null;

$language = is_string($meta['language'] ?? null) && $meta['language'] !== ''
    ? (string) $meta['language']
    : 'ru';

$alternates = is_array($meta['alternates'] ?? null) ? $meta['alternates'] : [];
$web = is_array($props['web'] ?? null) ? $props['web'] : [];
$site = is_array($web['site'] ?? null) ? $web['site'] : [];
$brand = is_array($site['brand'] ?? null) ? $site['brand'] : [];
$brandLogo = is_array($brand['logo'] ?? null) ? $brand['logo'] : [];
$favicon = is_string($brandLogo['src'] ?? null) && $brandLogo['src'] !== ''
    ? (string) $brandLogo['src']
    : '/images/logo.svg';
$faviconPath = (string) (parse_url($favicon, PHP_URL_PATH) ?: $favicon);
$faviconExtension = strtolower((string) pathinfo($faviconPath, PATHINFO_EXTENSION));
$faviconType = match ($faviconExtension) {
    'svg' => 'image/svg+xml',
    'png' => 'image/png',
    'jpg', 'jpeg' => 'image/jpeg',
    'ico' => 'image/x-icon',
    default => null,
};

$keywords = null;
if (isset($meta['keywords'])) {
    if (is_array($meta['keywords'])) {
        $keywords = implode(', ', array_values(array_filter($meta['keywords'], 'is_string')));
    } elseif (is_string($meta['keywords'])) {
        $keywords = $meta['keywords'];
    }
}

if ($title !== null) {
    $title = htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

if ($description !== null) {
    $description = htmlspecialchars($description, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

if ($canonical !== null) {
    $canonical = htmlspecialchars($canonical, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$favicon = htmlspecialchars($favicon, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$faviconType = $faviconType === null
    ? null
    : htmlspecialchars($faviconType, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

$language = htmlspecialchars($language, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

if ($keywords !== null) {
    $keywords = htmlspecialchars($keywords, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
?>
<!doctype html>
<html lang="<?= $language ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="<?= $favicon ?>"<?php if ($faviconType !== null) : ?> type="<?= $faviconType ?>"<?php endif; ?>>
    <?php if (!$hasSsr) : ?>
        <?php if ($title !== null) : ?>
            <title><?= $title ?></title>
            <meta property="og:title" content="<?= $title ?>">
        <?php endif; ?>
        <?php if ($description !== null) : ?>
            <meta name="description" content="<?= $description ?>">
            <meta property="og:description" content="<?= $description ?>">
        <?php endif; ?>
        <?php if ($canonical !== null) : ?>
            <link rel="canonical" href="<?= $canonical ?>">
        <?php endif; ?>
        <?php foreach ($alternates as $alternate) : ?>
            <?php
            if (!is_array($alternate) || !is_string($alternate['locale'] ?? null) || !is_string($alternate['href'] ?? null)) {
                continue;
            }

            $alternateLocale = htmlspecialchars((string) $alternate['locale'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $alternateHref   = htmlspecialchars((string) $alternate['href'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            ?>
            <link rel="alternate" hreflang="<?= $alternateLocale ?>" href="<?= $alternateHref ?>">
        <?php endforeach; ?>
        <?php if ($keywords !== null) : ?>
            <meta name="keywords" content="<?= $keywords ?>">
        <?php endif; ?>
    <?php endif; ?>
    <?php if ($ssrHead !== []) : ?>
        <?= implode("\n", array_filter($ssrHead, 'is_string')) ?>
    <?php endif; ?>
    <?php if (isset($vite)) : ?>
        <?= $vite->reactRefreshPreamble() ?>
        <?= $vite->tags('resources/js/app.tsx') ?>
    <?php endif; ?>
</head>
<body>
<script data-page="<?= $rootId ?>" type="application/json"><?= $pageJsonRaw ?></script>
<div id="<?= $rootId ?>" data-page="<?= $pageJson ?>"><?= $ssrBody ?? '' ?></div>
</body>
</html>
