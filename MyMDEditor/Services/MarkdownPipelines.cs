using Markdig;

namespace MyMDEditor.Services
{
    /// <summary>Provides the single Markdig pipeline configuration shared by preview and exporters.</summary>
    public static class MarkdownPipelines
    {
        public static MarkdownPipeline Create() =>
            new MarkdownPipelineBuilder()
                .UseAdvancedExtensions()
                .UseEmojiAndSmiley()
                .Build();
    }
}
