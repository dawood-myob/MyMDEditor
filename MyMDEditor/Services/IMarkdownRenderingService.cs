namespace MyMDEditor.Services
{
    /// <summary>
    /// Converts Markdown text into HTML and a heading outline.
    /// </summary>
    public interface IMarkdownRenderingService
    {
        /// <summary>
        /// Parses once and returns the HTML fragment and outline. When <paramref name="includeSourceMap"/>
        /// is true every block carries data-sl/data-el (line range) and data-ss/data-se (offset range)
        /// attributes used for editor/preview synchronisation.
        /// </summary>
        Task<RenderResult> RenderAsync(string markdown, bool includeSourceMap = true, CancellationToken cancellationToken = default);

        /// <summary>Renders a complete, standalone HTML document (used for export).</summary>
        Task<string> RenderToHtmlAsync(string markdown, string? title = null, CancellationToken cancellationToken = default);
    }
}
