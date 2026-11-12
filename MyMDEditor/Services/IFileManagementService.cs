using System.Text;

namespace MyMDEditor.Services
{
    /// <summary>Encoding and line-ending style detected when a file was opened, reused when saving.</summary>
    public sealed record DocumentFormat(Encoding Encoding, string LineEnding)
    {
        public static DocumentFormat Default { get; } = new(new UTF8Encoding(false), "\n");

        public string EncodingName => Encoding switch
        {
            UTF8Encoding u when u.GetPreamble().Length > 0 => "UTF-8 with BOM",
            UTF8Encoding => "UTF-8",
            UnicodeEncoding => "UTF-16",
            _ => Encoding.EncodingName
        };

        public string LineEndingName => LineEnding == "\r\n" ? "CRLF" : "LF";
    }

    /// <summary>Handles opening and saving Markdown files.</summary>
    public interface IFileManagementService
    {
        string? CurrentFilePath { get; }

        /// <summary>Format of the current document; new documents use UTF-8 (no BOM) with LF endings.</summary>
        DocumentFormat CurrentFormat { get; }

        /// <summary>Reads a file and returns its text with line endings normalised to LF.</summary>
        Task<string> OpenFileAsync(string filePath, CancellationToken cancellationToken = default);

        /// <summary>Saves LF-normalised text, restoring the original encoding and line endings.</summary>
        Task SaveFileAsync(string filePath, string content, CancellationToken cancellationToken = default);

        /// <summary>Forgets the current file (used for "New").</summary>
        void Reset();
    }
}
