using System.Text;

namespace MyMDEditor.Services
{
    /// <summary>
    /// Reads and writes Markdown files from disk asynchronously.
    /// </summary>
    public sealed class FileManagementService : IFileManagementService
    {
        public string? CurrentFilePath { get; private set; }

        public async Task<string> OpenFileAsync(string filePath, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(filePath))
            {
                throw new ArgumentException("File path must be provided.", nameof(filePath));
            }

            var content = await File.ReadAllTextAsync(filePath, Encoding.UTF8, cancellationToken).ConfigureAwait(false);
            CurrentFilePath = filePath;
            return content;
        }

        public async Task SaveFileAsync(string filePath, string content, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(filePath))
            {
                throw new ArgumentException("File path must be provided.", nameof(filePath));
            }

            await File.WriteAllTextAsync(filePath, content ?? string.Empty, Encoding.UTF8, cancellationToken).ConfigureAwait(false);
            CurrentFilePath = filePath;
        }
    }
}
