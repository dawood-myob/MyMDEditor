namespace MyMDEditor.Services
{
    /// <summary>
    /// Converts Markdown text into GitHub-style HTML.
    /// </summary>
    public interface IMarkdownRenderingService
    {
        Task<string> RenderToHtmlAsync(string markdown, CancellationToken cancellationToken = default);
    }
}
