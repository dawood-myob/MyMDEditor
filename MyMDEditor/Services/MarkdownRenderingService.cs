using System.Text;
using Markdig;
using Markdig.Renderers;
using Markdig.Renderers.Html;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace MyMDEditor.Services
{
    /// <summary>
    /// Renders Markdown to HTML using Markdig with GitHub-flavored extensions.
    /// A single parse produces the HTML, the heading outline and (optionally) source-position
    /// attributes on every block so the preview can be mapped back to the Markdown source.
    /// </summary>
    public sealed class MarkdownRenderingService : IMarkdownRenderingService
    {
        private readonly MarkdownPipeline _pipeline = MarkdownPipelines.Create();

        public Task<RenderResult> RenderAsync(string markdown, bool includeSourceMap = true, CancellationToken cancellationToken = default)
        {
            return Task.Run(() =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                return Render(markdown ?? string.Empty, includeSourceMap, cancellationToken);
            }, cancellationToken);
        }

        public async Task<string> RenderToHtmlAsync(string markdown, string? title = null, CancellationToken cancellationToken = default)
        {
            var result = await RenderAsync(markdown, includeSourceMap: false, cancellationToken).ConfigureAwait(false);
            var documentTitle = !string.IsNullOrWhiteSpace(title)
                ? title!
                : result.Outline.FirstOrDefault()?.Title ?? "Document";
            return PreviewAssets.BuildStandaloneDocument(documentTitle, result.BodyHtml);
        }

        public RenderResult Render(string markdown, bool includeSourceMap, CancellationToken cancellationToken = default)
        {
            var document = Markdown.Parse(markdown, _pipeline);
            cancellationToken.ThrowIfCancellationRequested();

            var lineIndex = includeSourceMap ? new LineIndex(markdown) : null;
            var outline = new List<OutlineEntry>();

            foreach (var block in document.Descendants<Block>())
            {
                if (block is HeadingBlock heading)
                {
                    outline.Add(new OutlineEntry(heading.Level, GetPlainText(heading.Inline), heading.Line, heading.Span.Start));
                }

                if (lineIndex is not null && block is not (LinkReferenceDefinitionGroup or LinkReferenceDefinition))
                {
                    AddSourceAttributes(block, lineIndex);
                }
            }

            cancellationToken.ThrowIfCancellationRequested();

            using var writer = new StringWriter();
            var renderer = new HtmlRenderer(writer);
            _pipeline.Setup(renderer);
            renderer.Render(document);
            writer.Flush();

            return new RenderResult(writer.ToString(), outline);
        }

        private static void AddSourceAttributes(Block block, LineIndex lineIndex)
        {
            if (block.Span.IsEmpty)
            {
                return;
            }

            var startOffset = block.Span.Start;
            var endOffset = Math.Min(block.Span.End + 1, lineIndex.Length);
            var startLine = lineIndex.GetLineFromOffset(startOffset);
            var endLine = lineIndex.GetLineFromOffset(Math.Max(startOffset, endOffset - 1));

            var attributes = block.GetAttributes();
            attributes.AddProperty("data-sl", startLine.ToString());
            attributes.AddProperty("data-el", endLine.ToString());
            attributes.AddProperty("data-ss", startOffset.ToString());
            attributes.AddProperty("data-se", endOffset.ToString());
        }

        /// <summary>Flattens heading inlines to plain text, dropping emphasis/link markup.</summary>
        internal static string GetPlainText(ContainerInline? container)
        {
            if (container is null)
            {
                return string.Empty;
            }

            var builder = new StringBuilder();
            foreach (var inline in container.Descendants())
            {
                switch (inline)
                {
                    case LiteralInline literal:
                        builder.Append(literal.Content.ToString());
                        break;
                    case CodeInline code:
                        builder.Append(code.Content);
                        break;
                    case LineBreakInline:
                        builder.Append(' ');
                        break;
                }
            }

            return builder.ToString().Trim();
        }
    }
}

