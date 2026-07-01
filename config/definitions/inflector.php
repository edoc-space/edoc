<?php

declare(strict_types=1);

use PhpSoftBox\Inflector\Contracts\InflectorInterface;
use PhpSoftBox\Inflector\InflectorFactory;
use PhpSoftBox\Inflector\LanguageEnum;

use function PhpSoftBox\Container\factory;

return [
    InflectorInterface::class => factory(static function (): InflectorInterface {
        $lang     = strtolower((string) env('APP_INFLECTOR_LANG', 'en'));
        $language = $lang === 'en' ? LanguageEnum::EN : LanguageEnum::EN;

        return InflectorFactory::create($language);
    }),
];
