namespace MyMDEditor.Services
{
    /// <summary>Output of a single Markdown parse: the HTML fragment plus the heading outline.</summary>
    public sealed record RenderResult(string BodyHtml, IReadOnlyList<OutlineEntry> Outline);
}
