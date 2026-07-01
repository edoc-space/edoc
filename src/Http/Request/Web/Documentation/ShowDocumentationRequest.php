<?php

declare(strict_types=1);

namespace App\Http\Request\Web\Documentation;

use PhpSoftBox\Request\RequestSchema;
use PhpSoftBox\Validator\Filter\NullIfEmptyFilter;
use PhpSoftBox\Validator\Filter\TrimFilter;
use PhpSoftBox\Validator\Rule\StringValidation;

use function is_string;

final class ShowDocumentationRequest extends RequestSchema
{
    public function rules(): array
    {
        return [
            'locale' => [
                new StringValidation()
                    ->nullable()
                    ->max(8)
                    ->regex('/^[a-z]{2}(?:-[a-z]{2})?$/'),
            ],
            'path' => [
                new StringValidation()
                    ->nullable()
                    ->max(512)
                    ->regex('/^[a-z0-9._-]+(?:\/[a-z0-9._-]+)*$/'),
            ],
        ];
    }

    public function beforeValidation(): void
    {
        $routePath   = $this->route()->get('path');
        $routeLocale = $this->route()->get('locale');
        $requestData = $this->request->all();
        $requestPath = $requestData['path'] ?? null;

        $this->request->merge([
            'locale' => is_string($routeLocale) ? $routeLocale : null,
            'path'   => is_string($routePath) ? $routePath : (is_string($requestPath) ? $requestPath : null),
        ]);
    }

    public function filters(): array
    {
        return [
            'locale' => [new TrimFilter(), new NullIfEmptyFilter()],
            'path'   => [new TrimFilter(), new NullIfEmptyFilter()],
        ];
    }

    public function attributes(): array
    {
        return [
            'locale' => 'язык',
            'path'   => 'путь документации',
        ];
    }

    public function slugPath(): ?string
    {
        return $this->getNullableString('path');
    }

    public function localeCode(): ?string
    {
        return $this->getNullableString('locale');
    }
}
