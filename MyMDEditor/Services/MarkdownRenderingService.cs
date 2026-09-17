using Markdig;

namespace MyMDEditor.Services
{
    /// <summary>
    /// Renders Markdown to HTML using Markdig with GitHub-flavored extensions,
    /// wrapping the result with GitHub-style CSS for a familiar look.
    /// </summary>
    public sealed class MarkdownRenderingService : IMarkdownRenderingService
    {
        private readonly MarkdownPipeline _pipeline;

        public MarkdownRenderingService()
        {
            _pipeline = new MarkdownPipelineBuilder()
                .UseAdvancedExtensions()
                .UseEmojiAndSmiley()
                .Build();
        }

        public Task<string> RenderToHtmlAsync(string markdown, CancellationToken cancellationToken = default)
        {
            return Task.Run(() =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                var body = Markdown.ToHtml(markdown ?? string.Empty, _pipeline);
                return WrapWithGitHubStyle(body);
            }, cancellationToken);
        }

        private static string WrapWithGitHubStyle(string bodyHtml)
        {
            return $$"""
            <!DOCTYPE html>
            <html>
            <head>
            <meta charset="utf-8" />
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
                    font-size: 16px;
                    line-height: 1.6;
                    color: #24292f;
                    background-color: #ffffff;
                    padding: 16px 24px;
                    word-wrap: break-word;
                }
                h1, h2, h3, h4, h5, h6 {
                    font-weight: 600;
                    margin-top: 24px;
                    margin-bottom: 16px;
                    border-bottom: 1px solid #d0d7de;
                    padding-bottom: 0.3em;
                }
                h1 { font-size: 2em; }
                h2 { font-size: 1.5em; }
                h3, h4, h5, h6 { border-bottom: none; }
                a { color: #0969da; text-decoration: none; }
                a:hover { text-decoration: underline; }
                code {
                    background-color: rgba(175,184,193,0.2);
                    padding: 0.2em 0.4em;
                    border-radius: 6px;
                    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
                    font-size: 85%;
                }
                pre {
                    background-color: #f6f8fa;
                    border-radius: 6px;
                    padding: 16px;
                    overflow: auto;
                }
                pre code {
                    background-color: transparent;
                    padding: 0;
                }
                blockquote {
                    border-left: 0.25em solid #d0d7de;
                    color: #57606a;
                    padding: 0 1em;
                    margin: 0;
                }
                table {
                    border-collapse: collapse;
                    width: 100%;
                    margin: 16px 0;
                }
                table th, table td {
                    border: 1px solid #d0d7de;
                    padding: 6px 13px;
                }
                table tr:nth-child(2n) {
                    background-color: #f6f8fa;
                }
                img { max-width: 100%; }
                hr {
                    border: none;
                    border-top: 1px solid #d0d7de;
                    margin: 24px 0;
                }
            </style>
            </head>
            <body>
            {{bodyHtml}}
            </body>
            </html>
            """;
        }
    }
}
