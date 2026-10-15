<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Http\Request\Web\Documentation\ShowDocumentationRequest;
use App\Http\Request\Web\Page\ShowPageRequest;
use PhpSoftBox\Http\Message\ServerRequest;
use PhpSoftBox\Request\Request;
use PhpSoftBox\Validator\Exception\ValidationException;
use PhpSoftBox\Validator\Validator;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\TestCase;

#[CoversClass(ShowDocumentationRequest::class)]
#[CoversClass(ShowPageRequest::class)]
#[Group('integration')]
final class RequestSchemaTest extends TestCase
{
    /**
     * Проверим фильтрацию входных данных и приоритет параметров маршрута над query.
     *
     * @see ShowDocumentationRequest::beforeValidation()
     * @see ShowDocumentationRequest::filters()
     * @see ShowPageRequest::beforeValidation()
     * @see ShowPageRequest::filters()
     */
    #[DataProvider('validRequests')]
    public function testRequestValidatesAndNormalizesInput(string $schemaClass, array $routeParams, array $queryParams, ?string $path, ?string $locale): void
    {
        $psrRequest = new ServerRequest(
            'GET',
            'https://example.test/',
            queryParams: $queryParams,
            attributes: [Request::ROUTE_PARAMS_ATTRIBUTE => $routeParams],
        );

        $schema = new $schemaClass(new Request($psrRequest, new Validator()));

        $schema->validate();

        $this->assertSame($path, $schema->slugPath());
        $this->assertSame($locale, $schema->localeCode());
    }

    /**
     * Проверим, что недопустимый путь отклоняется валидатором.
     *
     * @see ShowDocumentationRequest::rules()
     * @see ShowPageRequest::rules()
     */
    #[DataProvider('schemas')]
    public function testRequestRejectsInvalidPath(string $schemaClass): void
    {
        $psrRequest = new ServerRequest(
            'GET',
            'https://example.test/',
            attributes: [Request::ROUTE_PARAMS_ATTRIBUTE => ['path' => 'invalid path']],
        );

        $schema = new $schemaClass(new Request($psrRequest, new Validator()));

        $this->expectException(ValidationException::class);

        $schema->validate();
    }

    public static function validRequests(): iterable
    {
        foreach (self::schemas() as $name => [$schemaClass]) {
            yield $name . ' route priority' => [
                $schemaClass,
                ['path' => ' start/overview ', 'locale' => ' ru '],
                ['path' => 'other', 'locale' => 'en'],
                'start/overview',
                'ru',
            ];
            yield $name . ' root' => [$schemaClass, [], [], null, null];
            yield $name . ' empty path' => [$schemaClass, ['path' => ' '], [], null, null];
        }
    }

    public static function schemas(): iterable
    {
        yield 'documentation' => [ShowDocumentationRequest::class];
        yield 'page' => [ShowPageRequest::class];
    }
}
