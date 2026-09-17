namespace MyMDEditor.Services
{
    /// <summary>
    /// Handles opening and saving Markdown files.
    /// </summary>
    public interface IFileManagementService
    {
        string? CurrentFilePath { get; }

        Task<string> OpenFileAsync(string filePath, CancellationToken cancellationToken = default);

        Task SaveFileAsync(string filePath, string content, CancellationToken cancellationToken = default);
    }
}
