<?php

declare(strict_types=1);

namespace App\Feature\Content;

use PhpSoftBox\Markdown\MarkdownDiagnostic;
use PhpSoftBox\Markdown\MarkdownDocument;
use PhpSoftBox\Markdown\MarkdownRenderer;
use PhpSoftBox\Markdown\MarkdownRenderOptions;

final readonly class MarkdownContentRenderer implements ContentRendererInterface
{
    public function __construct(
        private MarkdownRenderer $renderer,
    ) {
    }

    public function render(string $source, ContentRenderOptions $options): RenderedContent
    {
        $document = $this->renderer->render($source, new MarkdownRenderOptions(
            htmlPolicy: $options->htmlPolicy,
            tocMinHeadingLevel: $options->tocMinHeadingLevel,
            tocMaxHeadingLevel: $options->tocMaxHeadingLevel,
            currentDocumentPath: $options->path,
            linkResolver: $options->linkResolver,
            externalLinkTarget: $options->externalLinkTarget,
            externalLinksNoFollow: $options->externalLinksNoFollow,
            allowedCodeLanguages: $options->allowedCodeLanguages,
        ));

        return new RenderedContent(
            html: $document->html(),
            frontMatter: $document->frontMatter(),
            toc: $this->tocToArray($document),
            diagnostics: $this->diagnosticsToArray($document, $options->path),
        );
    }

    /**
     * @return list<array<string,mixed>>
     */
    private function tocToArray(MarkdownDocument $document): array
    {
        $items = [];
        foreach ($document->toc()->items() as $item) {
            $items[] = [
                'level' => $item->level(),
                'title' => $item->title(),
                'id'    => $item->id(),
            ];
        }

        return $items;
    }

    /**
     * @return list<array<string,mixed>>
     */
    private function diagnosticsToArray(MarkdownDocument $document, string $path): array
    {
        $items = [];
        foreach ($document->diagnostics() as $diagnostic) {
            $items[] = $this->diagnosticToArray($diagnostic, $path);
        }

        return $items;
    }

    /**
     * @return array<string,mixed>
     */
    private function diagnosticToArray(MarkdownDiagnostic $diagnostic, string $path): array
    {
        return [
            'level'   => $diagnostic->level()->value,
            'code'    => $diagnostic->code(),
            'message' => $diagnostic->message(),
            'path'    => $path,
            'line'    => $diagnostic->line(),
        ];
    }
}
