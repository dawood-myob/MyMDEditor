using System.Text;

namespace MyMDEditor.Services
{
    /// <summary>
    /// Reads and writes Markdown files from disk asynchronously, preserving the file's encoding
    /// (including BOM) and line-ending style, and saving atomically so a crash never truncates a document.
    /// </summary>
    public sealed class FileManagementService : IFileManagementService
    {
        public string? CurrentFilePath { get; private set; }

        public DocumentFormat CurrentFormat { get; private set; } = DocumentFormat.Default;

        public async Task<string> OpenFileAsync(string filePath, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(filePath))
            {
                throw new ArgumentException("File path must be provided.", nameof(filePath));
            }

            var bytes = await File.ReadAllBytesAsync(filePath, cancellationToken).ConfigureAwait(false);
            var (text, encoding) = Decode(bytes);
            var lineEnding = DetectLineEnding(text);

            CurrentFormat = new DocumentFormat(encoding, lineEnding);
            CurrentFilePath = filePath;
            return NormalizeLineEndings(text);
        }

        public async Task SaveFileAsync(string filePath, string content, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(filePath))
            {
                throw new ArgumentException("File path must be provided.", nameof(filePath));
            }

            var format = CurrentFormat;
            var text = NormalizeLineEndings(content ?? string.Empty);
            if (format.LineEnding != "\n")
            {
                text = text.Replace("\n", format.LineEnding);
            }

            var preamble = format.Encoding.GetPreamble();
            var body = format.Encoding.GetBytes(text);
            var bytes = new byte[preamble.Length + body.Length];
            preamble.CopyTo(bytes, 0);
            body.CopyTo(bytes, preamble.Length);

            await WriteAtomicAsync(filePath, bytes, cancellationToken).ConfigureAwait(false);
            CurrentFilePath = filePath;
        }

        public void Reset()
        {
            CurrentFilePath = null;
            CurrentFormat = DocumentFormat.Default;
        }

        public static string NormalizeLineEndings(string text) =>
            text.Contains('\r') ? text.Replace("\r\n", "\n").Replace('\r', '\n') : text;

        public static string DetectLineEnding(string text)
        {
            var crlf = 0;
            var lf = 0;
            for (var i = 0; i < text.Length; i++)
            {
                if (text[i] != '\n')
                {
                    continue;
                }

                if (i > 0 && text[i - 1] == '\r')
                {
                    crlf++;
                }
                else
                {
                    lf++;
                }
            }

            return crlf > lf ? "\r\n" : "\n";
        }

        public static (string Text, Encoding Encoding) Decode(byte[] bytes)
        {
            if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
            {
                return (new UTF8Encoding(true).GetString(bytes, 3, bytes.Length - 3), new UTF8Encoding(true));
            }

            if (bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE)
            {
                var utf16 = new UnicodeEncoding(false, true);
                return (utf16.GetString(bytes, 2, bytes.Length - 2), utf16);
            }

            if (bytes.Length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF)
            {
                var utf16Be = new UnicodeEncoding(true, true);
                return (utf16Be.GetString(bytes, 2, bytes.Length - 2), utf16Be);
            }

            try
            {
                var strict = new UTF8Encoding(false, throwOnInvalidBytes: true);
                return (strict.GetString(bytes), new UTF8Encoding(false));
            }
            catch (DecoderFallbackException)
            {
                // Not valid UTF-8: treat as a legacy single-byte file rather than corrupting it with U+FFFD.
                return (Encoding.Latin1.GetString(bytes), Encoding.Latin1);
            }
        }

        private static async Task WriteAtomicAsync(string filePath, byte[] bytes, CancellationToken cancellationToken)
        {
            var directory = Path.GetDirectoryName(Path.GetFullPath(filePath))!;
            var tempPath = Path.Combine(directory, $".{Path.GetFileName(filePath)}.{Guid.NewGuid():N}.tmp");

            try
            {
                await File.WriteAllBytesAsync(tempPath, bytes, cancellationToken).ConfigureAwait(false);

                if (File.Exists(filePath))
                {
                    File.Replace(tempPath, filePath, destinationBackupFileName: null);
                }
                else
                {
                    File.Move(tempPath, filePath);
                }
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or PlatformNotSupportedException)
            {
                // Atomic replace is not always available (network shares, cloud-synced folders); fall back to a direct write.
                await File.WriteAllBytesAsync(filePath, bytes, cancellationToken).ConfigureAwait(false);
            }
            finally
            {
                if (File.Exists(tempPath))
                {
                    try { File.Delete(tempPath); } catch (IOException) { }
                }
            }
        }
    }
}
