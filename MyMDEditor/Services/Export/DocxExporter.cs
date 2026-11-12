using System.IO.Compression;
using System.Text;
using Markdig;
using Markdig.Extensions.Footnotes;
using Markdig.Extensions.Tables;
using Markdig.Extensions.TaskLists;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace MyMDEditor.Services.Export
{
    /// <summary>
    /// Converts Markdown to a minimal but valid WordprocessingML (.docx) package without any third-party OPC library.
    /// Lists are rendered as indented paragraphs with literal markers so no numbering part is required.
    /// </summary>
    public static class DocxExporter
    {
        private const string WordNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        private const string RelNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        private const string PackageRelNs = "http://schemas.openxmlformats.org/package/2006/relationships";
        private const string XmlHeader = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n";

        public static byte[] Build(string markdown, string? title = null)
        {
            var document = Markdown.Parse(markdown ?? string.Empty, MarkdownPipelines.Create());
            var builder = new DocumentBuilder();
            builder.RenderBlocks(document, default);
            string documentXml = builder.ToDocumentXml();

            using var stream = new MemoryStream();
            using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
            {
                AddEntry(zip, "[Content_Types].xml", ContentTypesXml());
                AddEntry(zip, "_rels/.rels", RootRelsXml());
                AddEntry(zip, "docProps/core.xml", CoreXml(title));
                AddEntry(zip, "word/document.xml", documentXml);
                AddEntry(zip, "word/styles.xml", StylesXml());
                AddEntry(zip, "word/_rels/document.xml.rels", builder.ToDocumentRelsXml());
            }
            return stream.ToArray();
        }

        public static async Task ExportAsync(string markdown, string filePath, string? title = null, CancellationToken ct = default)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
            ct.ThrowIfCancellationRequested();

            byte[] bytes = Build(markdown, title);
            string fullPath = Path.GetFullPath(filePath);
            string? directory = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            string tempPath = fullPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                await File.WriteAllBytesAsync(tempPath, bytes, ct).ConfigureAwait(false);
                ct.ThrowIfCancellationRequested();
                File.Move(tempPath, fullPath, overwrite: true);
            }
            catch
            {
                try { File.Delete(tempPath); } catch (IOException) { } catch (UnauthorizedAccessException) { }
                throw;
            }
        }

        private static void AddEntry(ZipArchive zip, string name, string content)
        {
            var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
            using var entryStream = entry.Open();
            var bytes = new UTF8Encoding(false).GetBytes(content);
            entryStream.Write(bytes, 0, bytes.Length);
        }

        private static string ContentTypesXml() =>
            XmlHeader +
            "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
            "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
            "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
            "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>" +
            "<Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>" +
            "<Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/>" +
            "</Types>";

        private static string RootRelsXml() =>
            XmlHeader +
            $"<Relationships xmlns=\"{PackageRelNs}\">" +
            $"<Relationship Id=\"rId1\" Type=\"{RelNs}/officeDocument\" Target=\"word/document.xml\"/>" +
            $"<Relationship Id=\"rId2\" Type=\"{PackageRelNs.Replace("/relationships", "")}/metadata/core-properties\" Target=\"docProps/core.xml\"/>" +
            "</Relationships>";

        private static string CoreXml(string? title)
        {
            string created = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", System.Globalization.CultureInfo.InvariantCulture);
            var sb = new StringBuilder(XmlHeader);
            sb.Append("<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" ")
              .Append("xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\" ")
              .Append("xmlns:dcmitype=\"http://purl.org/dc/dcmitype/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">");
            if (!string.IsNullOrWhiteSpace(title))
            {
                sb.Append("<dc:title>").Append(Escape(Clean(title))).Append("</dc:title>");
            }
            sb.Append("<dc:creator>MyMDEditor</dc:creator>");
            sb.Append("<dcterms:created xsi:type=\"dcterms:W3CDTF\">").Append(created).Append("</dcterms:created>");
            sb.Append("<dcterms:modified xsi:type=\"dcterms:W3CDTF\">").Append(created).Append("</dcterms:modified>");
            sb.Append("</cp:coreProperties>");
            return sb.ToString();
        }

        private static string StylesXml()
        {
            var sb = new StringBuilder(XmlHeader);
            sb.Append($"<w:styles xmlns:w=\"{WordNs}\">");
            sb.Append("<w:docDefaults>" +
                      "<w:rPrDefault><w:rPr><w:rFonts w:ascii=\"Calibri\" w:hAnsi=\"Calibri\" w:eastAsia=\"Calibri\" w:cs=\"Calibri\"/><w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/></w:rPr></w:rPrDefault>" +
                      "<w:pPrDefault><w:pPr><w:spacing w:after=\"120\" w:line=\"264\" w:lineRule=\"auto\"/></w:pPr></w:pPrDefault>" +
                      "</w:docDefaults>");
            sb.Append("<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/><w:qFormat/></w:style>");
            sb.Append("<w:style w:type=\"character\" w:default=\"1\" w:styleId=\"DefaultParagraphFont\"><w:name w:val=\"Default Paragraph Font\"/><w:uiPriority w:val=\"1\"/><w:semiHidden/><w:unhideWhenUsed/></w:style>");
            sb.Append("<w:style w:type=\"table\" w:default=\"1\" w:styleId=\"TableNormal\"><w:name w:val=\"Normal Table\"/><w:uiPriority w:val=\"99\"/><w:semiHidden/><w:unhideWhenUsed/>" +
                      "<w:tblPr><w:tblInd w:w=\"0\" w:type=\"dxa\"/><w:tblCellMar><w:top w:w=\"0\" w:type=\"dxa\"/><w:left w:w=\"108\" w:type=\"dxa\"/><w:bottom w:w=\"0\" w:type=\"dxa\"/><w:right w:w=\"108\" w:type=\"dxa\"/></w:tblCellMar></w:tblPr></w:style>");
            sb.Append("<w:style w:type=\"numbering\" w:default=\"1\" w:styleId=\"NoList\"><w:name w:val=\"No List\"/><w:uiPriority w:val=\"99\"/><w:semiHidden/><w:unhideWhenUsed/></w:style>");

            int[] sizes = { 40, 32, 28, 26, 24, 22 };
            string[] colors = { "1F3864", "2F5496", "2F5496", "1F3864", "1F3864", "595959" };
            for (int i = 1; i <= 6; i++)
            {
                sb.Append($"<w:style w:type=\"paragraph\" w:styleId=\"Heading{i}\"><w:name w:val=\"heading {i}\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:uiPriority w:val=\"9\"/><w:qFormat/>" +
                          $"<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before=\"{(i <= 2 ? 320 : 200)}\" w:after=\"100\"/><w:outlineLvl w:val=\"{i - 1}\"/></w:pPr>" +
                          $"<w:rPr><w:b/><w:bCs/><w:color w:val=\"{colors[i - 1]}\"/><w:sz w:val=\"{sizes[i - 1]}\"/><w:szCs w:val=\"{sizes[i - 1]}\"/></w:rPr></w:style>");
            }

            sb.Append("<w:style w:type=\"paragraph\" w:styleId=\"Quote\"><w:name w:val=\"Quote\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:uiPriority w:val=\"29\"/><w:qFormat/>" +
                      "<w:pPr><w:pBdr><w:left w:val=\"single\" w:sz=\"18\" w:space=\"8\" w:color=\"A6A6A6\"/></w:pBdr><w:ind w:left=\"567\"/></w:pPr>" +
                      "<w:rPr><w:color w:val=\"595959\"/></w:rPr></w:style>");
            sb.Append("<w:style w:type=\"paragraph\" w:customStyle=\"1\" w:styleId=\"CodeBlock\"><w:name w:val=\"Code Block\"/><w:basedOn w:val=\"Normal\"/><w:uiPriority w:val=\"30\"/><w:qFormat/>" +
                      "<w:pPr><w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"F2F2F2\"/><w:spacing w:before=\"60\" w:after=\"120\" w:line=\"240\" w:lineRule=\"auto\"/></w:pPr>" +
                      "<w:rPr><w:rFonts w:ascii=\"Consolas\" w:hAnsi=\"Consolas\" w:eastAsia=\"Consolas\" w:cs=\"Consolas\"/><w:sz w:val=\"20\"/><w:szCs w:val=\"20\"/></w:rPr></w:style>");
            sb.Append("<w:style w:type=\"character\" w:styleId=\"Hyperlink\"><w:name w:val=\"Hyperlink\"/><w:basedOn w:val=\"DefaultParagraphFont\"/><w:uiPriority w:val=\"99\"/><w:unhideWhenUsed/>" +
                      "<w:rPr><w:color w:val=\"0563C1\"/><w:u w:val=\"single\"/></w:rPr></w:style>");
            sb.Append("<w:style w:type=\"table\" w:styleId=\"TableGrid\"><w:name w:val=\"Table Grid\"/><w:basedOn w:val=\"TableNormal\"/><w:uiPriority w:val=\"39\"/>" +
                      "<w:tblPr><w:tblBorders>" +
                      "<w:top w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:left w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/>" +
                      "<w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:right w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/>" +
                      "<w:insideH w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:insideV w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/>" +
                      "</w:tblBorders></w:tblPr></w:style>");
            sb.Append("</w:styles>");
            return sb.ToString();
        }

        /// <summary>Removes characters that are illegal in XML 1.0 (including unpaired surrogates).</summary>
        internal static string Clean(string? text)
        {
            if (string.IsNullOrEmpty(text))
            {
                return string.Empty;
            }

            var sb = new StringBuilder(text.Length);
            for (int i = 0; i < text.Length; i++)
            {
                char c = text[i];
                if (char.IsHighSurrogate(c))
                {
                    if (i + 1 < text.Length && char.IsLowSurrogate(text[i + 1]))
                    {
                        sb.Append(c).Append(text[i + 1]);
                        i++;
                    }
                }
                else if (c == '\t' || c == '\n' || c == '\r' ||
                         (c >= 0x20 && c <= 0xD7FF) || (c >= 0xE000 && c <= 0xFFFD))
                {
                    sb.Append(c);
                }
            }
            return sb.ToString();
        }

        internal static string Escape(string text) =>
            text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");

        private readonly record struct Fmt(
            bool Bold = false, bool Italic = false, bool Strike = false, bool Code = false,
            bool Underline = false, bool Highlight = false, string? VertAlign = null, bool Hyperlink = false);

        private readonly record struct Ctx(
            int QuoteDepth = 0, int ListDepth = 0, bool Compact = false, bool Bold = false, string? Jc = null);

        private sealed class DocumentBuilder
        {
            private readonly StringBuilder _body = new();
            private readonly List<string> _hyperlinkTargets = new();
            private string? _pendingMarker;
            private string? _pendingPrefix;

            public string ToDocumentXml()
            {
                string content = _body.Length == 0 ? "<w:p/>" : _body.ToString();
                return XmlHeader +
                       $"<w:document xmlns:w=\"{WordNs}\" xmlns:r=\"{RelNs}\"><w:body>" +
                       content +
                       "<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/>" +
                       "<w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\" w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/></w:sectPr>" +
                       "</w:body></w:document>";
            }

            public string ToDocumentRelsXml()
            {
                var sb = new StringBuilder(XmlHeader);
                sb.Append($"<Relationships xmlns=\"{PackageRelNs}\">");
                sb.Append($"<Relationship Id=\"rId1\" Type=\"{RelNs}/styles\" Target=\"styles.xml\"/>");
                for (int i = 0; i < _hyperlinkTargets.Count; i++)
                {
                    sb.Append($"<Relationship Id=\"rId{i + 2}\" Type=\"{RelNs}/hyperlink\" Target=\"{Escape(_hyperlinkTargets[i])}\" TargetMode=\"External\"/>");
                }
                sb.Append("</Relationships>");
                return sb.ToString();
            }

            public void RenderBlocks(ContainerBlock container, Ctx ctx)
            {
                foreach (var block in container)
                {
                    RenderBlock(block, ctx);
                }
            }

            private void RenderBlock(Block block, Ctx ctx)
            {
                switch (block)
                {
                    case LinkReferenceDefinitionGroup:
                    case LinkReferenceDefinition:
                        break;
                    case HeadingBlock heading:
                        RenderHeading(heading, ctx);
                        break;
                    case ParagraphBlock paragraph:
                        RenderParagraph(paragraph, ctx);
                        break;
                    case ThematicBreakBlock:
                        RenderThematicBreak(ctx);
                        break;
                    case CodeBlock code:
                        RenderCode(GetLines(code), ctx);
                        break;
                    case HtmlBlock html:
                        RenderPlainLines(GetLines(html), ctx);
                        break;
                    case ListBlock list:
                        RenderList(list, ctx);
                        break;
                    case QuoteBlock quote:
                        RenderBlocks(quote, ctx with { QuoteDepth = ctx.QuoteDepth + 1 });
                        break;
                    case Table table:
                        RenderTable(table, ctx);
                        break;
                    case Footnote footnote:
                        _pendingPrefix = $"[{footnote.Order}] ";
                        RenderBlocks(footnote, ctx);
                        _pendingPrefix = null;
                        break;
                    case Markdig.Extensions.DefinitionLists.DefinitionTerm term:
                        RenderInlineLeaf(term, ctx with { Bold = true }, null);
                        break;
                    case ContainerBlock container:
                        RenderBlocks(container, ctx);
                        break;
                    case LeafBlock leaf when leaf.Inline != null:
                        RenderInlineLeaf(leaf, ctx, null);
                        break;
                    case LeafBlock leaf:
                        RenderPlainLines(GetLines(leaf), ctx);
                        break;
                }
            }

            private static List<string> GetLines(LeafBlock block)
            {
                var result = new List<string>();
                var lines = block.Lines;
                if (lines.Lines != null)
                {
                    for (int i = 0; i < lines.Count; i++)
                    {
                        result.Add(lines.Lines[i].Slice.ToString());
                    }
                }
                return result;
            }

            private void RenderHeading(HeadingBlock heading, Ctx ctx)
            {
                int level = Math.Clamp(heading.Level, 1, 6);
                var sb = new StringBuilder("<w:p>");
                sb.Append(PPr(ctx, $"Heading{level}", marker: false, heading: true));
                AppendInlines(sb, heading.Inline, default);
                sb.Append("</w:p>");
                _body.Append(sb);
            }

            private void RenderParagraph(ParagraphBlock paragraph, Ctx ctx) =>
                RenderInlineLeaf(paragraph, ctx, null);

            private void RenderInlineLeaf(LeafBlock leaf, Ctx ctx, string? style)
            {
                string? marker = _pendingMarker;
                _pendingMarker = null;

                var sb = new StringBuilder("<w:p>");
                sb.Append(PPr(ctx, style, marker != null, heading: false));
                var fmt = new Fmt(Bold: ctx.Bold);
                if (marker != null)
                {
                    AppendText(sb, marker + "\t", fmt);
                }
                if (_pendingPrefix != null)
                {
                    AppendText(sb, _pendingPrefix, fmt with { Bold = true });
                    _pendingPrefix = null;
                }
                AppendInlines(sb, leaf.Inline, fmt);
                sb.Append("</w:p>");
                _body.Append(sb);
            }

            private void RenderPlainLines(List<string> lines, Ctx ctx)
            {
                var sb = new StringBuilder("<w:p>");
                sb.Append(PPr(ctx, null, false, heading: false));
                AppendText(sb, string.Join("\n", lines), new Fmt(Bold: ctx.Bold));
                sb.Append("</w:p>");
                _body.Append(sb);
            }

            private void RenderCode(List<string> lines, Ctx ctx)
            {
                var sb = new StringBuilder("<w:p>");
                sb.Append(PPr(ctx with { Compact = false }, "CodeBlock", false, heading: false));
                AppendText(sb, string.Join("\n", lines), default);
                sb.Append("</w:p>");
                _body.Append(sb);
            }

            private void RenderThematicBreak(Ctx ctx)
            {
                _body.Append("<w:p><w:pPr><w:pBdr><w:bottom w:val=\"single\" w:sz=\"8\" w:space=\"1\" w:color=\"808080\"/></w:pBdr>" +
                             "<w:spacing w:before=\"120\" w:after=\"120\"/>")
                     .Append(IndentXml(ctx, hanging: false))
                     .Append("</w:pPr></w:p>");
            }

            private void RenderList(ListBlock list, Ctx ctx)
            {
                int number = 1;
                if (list.IsOrdered && !int.TryParse(list.OrderedStart, out number))
                {
                    number = 1;
                }
                string delimiter = list.OrderedDelimiter == ')' ? ")" : ".";
                var itemCtx = ctx with { ListDepth = ctx.ListDepth + 1 };

                foreach (var child in list)
                {
                    if (child is not ListItemBlock item)
                    {
                        RenderBlock(child, itemCtx);
                        continue;
                    }

                    string marker;
                    var firstParagraph = item.FirstOrDefault() as ParagraphBlock;
                    if (firstParagraph?.Inline?.FirstChild is TaskList task)
                    {
                        marker = task.Checked ? "\u2611" : "\u2610";
                    }
                    else if (list.IsOrdered)
                    {
                        marker = number + delimiter;
                    }
                    else
                    {
                        marker = (ctx.ListDepth % 3) switch { 0 => "\u2022", 1 => "\u25E6", _ => "\u25AA" };
                    }
                    number++;

                    _pendingMarker = marker;
                    if (firstParagraph == null)
                    {
                        // The marker needs a paragraph of its own when the item does not start with one.
                        RenderMarkerOnly(itemCtx);
                    }
                    foreach (var block in item)
                    {
                        RenderBlock(block, itemCtx);
                    }
                    _pendingMarker = null;
                }
            }

            private void RenderMarkerOnly(Ctx ctx)
            {
                string marker = _pendingMarker!;
                _pendingMarker = null;
                var sb = new StringBuilder("<w:p>");
                sb.Append(PPr(ctx, null, true, heading: false));
                AppendText(sb, marker, default);
                sb.Append("</w:p>");
                _body.Append(sb);
            }

            private void RenderTable(Table table, Ctx ctx)
            {
                var rows = table.OfType<TableRow>().ToList();
                int columns = 1;
                foreach (var row in rows)
                {
                    int count = row.OfType<TableCell>().Sum(c => Math.Max(1, c.ColumnSpan));
                    columns = Math.Max(columns, count);
                }
                int colWidth = 9026 / columns;

                var sb = new StringBuilder("<w:tbl><w:tblPr><w:tblStyle w:val=\"TableGrid\"/><w:tblW w:w=\"5000\" w:type=\"pct\"/>" +
                    "<w:tblBorders>" +
                    "<w:top w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"808080\"/><w:left w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"808080\"/>" +
                    "<w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"808080\"/><w:right w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"808080\"/>" +
                    "<w:insideH w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"808080\"/><w:insideV w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"808080\"/>" +
                    "</w:tblBorders><w:tblLayout w:type=\"fixed\"/><w:tblLook w:val=\"04A0\" w:firstRow=\"1\" w:lastRow=\"0\" w:firstColumn=\"0\" w:lastColumn=\"0\" w:noHBand=\"0\" w:noVBand=\"1\"/></w:tblPr>");
                sb.Append("<w:tblGrid>");
                for (int i = 0; i < columns; i++)
                {
                    sb.Append($"<w:gridCol w:w=\"{colWidth}\"/>");
                }
                sb.Append("</w:tblGrid>");
                _body.Append(sb);

                foreach (var row in rows)
                {
                    _body.Append("<w:tr>");
                    if (row.IsHeader)
                    {
                        _body.Append("<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>");
                    }

                    int used = 0;
                    foreach (var cell in row.OfType<TableCell>())
                    {
                        int span = Math.Max(1, Math.Min(cell.ColumnSpan, columns - used));
                        RenderCell(cell, table, used, span, colWidth, row.IsHeader, ctx);
                        used += span;
                    }
                    while (used < columns)
                    {
                        RenderEmptyCell(colWidth);
                        used++;
                    }
                    _body.Append("</w:tr>");
                }
                _body.Append("</w:tbl>");
                // Word requires a paragraph after a table; it also separates it from following content.
                _body.Append("<w:p><w:pPr><w:spacing w:after=\"0\"/></w:pPr></w:p>");
            }

            private void RenderEmptyCell(int width) =>
                _body.Append($"<w:tc><w:tcPr><w:tcW w:w=\"{width}\" w:type=\"dxa\"/></w:tcPr><w:p><w:pPr><w:spacing w:after=\"0\"/></w:pPr></w:p></w:tc>");

            private void RenderCell(TableCell cell, Table table, int columnIndex, int span, int colWidth, bool header, Ctx ctx)
            {
                _body.Append("<w:tc><w:tcPr>")
                     .Append($"<w:tcW w:w=\"{colWidth * span}\" w:type=\"dxa\"/>");
                if (span > 1)
                {
                    _body.Append($"<w:gridSpan w:val=\"{span}\"/>");
                }
                if (header)
                {
                    _body.Append("<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"E7E6E6\"/>");
                }
                _body.Append("</w:tcPr>");

                string? jc = null;
                if (columnIndex < table.ColumnDefinitions.Count)
                {
                    jc = table.ColumnDefinitions[columnIndex].Alignment switch
                    {
                        TableColumnAlign.Center => "center",
                        TableColumnAlign.Right => "right",
                        _ => null
                    };
                }

                int before = _body.Length;
                var cellCtx = new Ctx(Compact: true, Bold: header, Jc: jc);
                RenderBlocks(cell, cellCtx);
                if (_body.Length == before)
                {
                    _body.Append("<w:p><w:pPr><w:spacing w:after=\"0\"/></w:pPr></w:p>");
                }
                _body.Append("</w:tc>");
            }

            private static string IndentXml(Ctx ctx, bool hanging)
            {
                int left = ctx.QuoteDepth * 567 + ctx.ListDepth * 720;
                if (left == 0 && !hanging)
                {
                    return string.Empty;
                }
                return hanging
                    ? $"<w:ind w:left=\"{left}\" w:hanging=\"360\"/>"
                    : $"<w:ind w:left=\"{left}\"/>";
            }

            private static string PPr(Ctx ctx, string? style, bool marker, bool heading)
            {
                if (style == null && ctx.QuoteDepth > 0 && !ctx.Compact)
                {
                    style = "Quote";
                }

                var sb = new StringBuilder("<w:pPr>");
                if (style != null)
                {
                    sb.Append($"<w:pStyle w:val=\"{style}\"/>");
                }
                if (ctx.Compact)
                {
                    sb.Append("<w:spacing w:after=\"0\"/>");
                }
                else if (ctx.ListDepth > 0 && !heading && style != "CodeBlock")
                {
                    sb.Append("<w:spacing w:after=\"60\"/>");
                }
                if (!ctx.Compact)
                {
                    sb.Append(IndentXml(ctx, marker));
                }
                if (ctx.Jc != null)
                {
                    sb.Append($"<w:jc w:val=\"{ctx.Jc}\"/>");
                }
                sb.Append("</w:pPr>");
                return sb.ToString();
            }

            private void AppendInlines(StringBuilder sb, ContainerInline? container, Fmt fmt)
            {
                if (container == null)
                {
                    return;
                }
                foreach (var inline in container)
                {
                    AppendInline(sb, inline, fmt);
                }
            }

            private void AppendInline(StringBuilder sb, Inline inline, Fmt fmt)
            {
                switch (inline)
                {
                    case TaskList:
                        break;
                    case Markdig.Extensions.Emoji.EmojiInline emoji:
                        AppendText(sb, emoji.Content.ToString(), fmt);
                        break;
                    case LiteralInline literal:
                        AppendText(sb, literal.Content.ToString(), fmt);
                        break;
                    case CodeInline code:
                        AppendText(sb, code.Content, fmt with { Code = true });
                        break;
                    case LineBreakInline lineBreak:
                        if (lineBreak.IsHard)
                        {
                            sb.Append("<w:r>").Append(RPr(fmt)).Append("<w:br/></w:r>");
                        }
                        else
                        {
                            AppendText(sb, " ", fmt);
                        }
                        break;
                    case HtmlEntityInline entity:
                        AppendText(sb, entity.Transcoded.ToString(), fmt);
                        break;
                    case HtmlInline html:
                        if (html.Tag.StartsWith("<br", StringComparison.OrdinalIgnoreCase))
                        {
                            sb.Append("<w:r>").Append(RPr(fmt)).Append("<w:br/></w:r>");
                        }
                        break;
                    case AutolinkInline auto:
                        AppendLink(sb, auto.IsEmail ? "mailto:" + auto.Url : auto.Url, fmt,
                            f => AppendText(sb, auto.Url, f));
                        break;
                    case FootnoteLink footnoteLink:
                        if (!footnoteLink.IsBackLink)
                        {
                            AppendText(sb, $"[{footnoteLink.Footnote.Order}]", fmt with { VertAlign = "superscript" });
                        }
                        break;
                    case LinkInline link when link.IsImage:
                        string alt = CollectText(link);
                        AppendText(sb, string.IsNullOrWhiteSpace(alt) ? "[Image]" : $"[Image: {alt}]", fmt with { Italic = true });
                        break;
                    case LinkInline link:
                        AppendLink(sb, link.Url, fmt, f =>
                        {
                            if (link.FirstChild == null)
                            {
                                AppendText(sb, link.Url ?? string.Empty, f);
                            }
                            else
                            {
                                AppendInlines(sb, link, f);
                            }
                        });
                        break;
                    case EmphasisInline emphasis:
                        AppendInlines(sb, emphasis, ApplyEmphasis(fmt, emphasis));
                        break;
                    case DelimiterInline delimiter:
                        AppendText(sb, delimiter.ToLiteral(), fmt);
                        break;
                    case Markdig.Extensions.Mathematics.MathInline math:
                        AppendText(sb, math.Content.ToString(), fmt with { Code = true });
                        break;
                    case ContainerInline container:
                        AppendInlines(sb, container, fmt);
                        break;
                }
            }

            private static Fmt ApplyEmphasis(Fmt fmt, EmphasisInline emphasis)
            {
                return emphasis.DelimiterChar switch
                {
                    '*' or '_' => emphasis.DelimiterCount >= 2 ? fmt with { Bold = true } : fmt with { Italic = true },
                    '~' => emphasis.DelimiterCount >= 2 ? fmt with { Strike = true } : fmt with { VertAlign = "subscript" },
                    '^' => fmt with { VertAlign = "superscript" },
                    '+' => fmt with { Underline = true },
                    '=' => fmt with { Highlight = true },
                    _ => fmt
                };
            }

            private void AppendLink(StringBuilder sb, string? url, Fmt fmt, Action<Fmt> renderContent)
            {
                string? target = NormalizeUrl(url);
                if (target == null || fmt.Hyperlink)
                {
                    renderContent(fmt);
                    return;
                }

                int index = _hyperlinkTargets.IndexOf(target);
                if (index < 0)
                {
                    _hyperlinkTargets.Add(target);
                    index = _hyperlinkTargets.Count - 1;
                }

                sb.Append($"<w:hyperlink r:id=\"rId{index + 2}\" w:history=\"1\">");
                renderContent(fmt with { Hyperlink = true });
                sb.Append("</w:hyperlink>");
            }
            private static string? NormalizeUrl(string? url)
            {
                if (string.IsNullOrWhiteSpace(url))
                {
                    return null;
                }
                string cleaned = Clean(url).Trim();
                if (!Uri.TryCreate(cleaned, UriKind.Absolute, out var uri))
                {
                    return null;
                }
                if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeMailto)
                {
                    return null;
                }
                bool hasWhitespaceOrControl = cleaned.Any(ch => char.IsWhiteSpace(ch) || char.IsControl(ch));
                return hasWhitespaceOrControl ? uri.AbsoluteUri : cleaned;
            }

            private static string CollectText(ContainerInline container)
            {
                var sb = new StringBuilder();
                foreach (var inline in container)
                {
                    switch (inline)
                    {
                        case LiteralInline literal:
                            sb.Append(literal.Content.ToString());
                            break;
                        case CodeInline code:
                            sb.Append(code.Content);
                            break;
                        case HtmlEntityInline entity:
                            sb.Append(entity.Transcoded.ToString());
                            break;
                        case LineBreakInline:
                            sb.Append(' ');
                            break;
                        case ContainerInline nested:
                            sb.Append(CollectText(nested));
                            break;
                    }
                }
                return sb.ToString();
            }

            private static string RPr(Fmt f)
            {
                if (f == default)
                {
                    return string.Empty;
                }

                var sb = new StringBuilder("<w:rPr>");
                if (f.Hyperlink)
                {
                    sb.Append("<w:rStyle w:val=\"Hyperlink\"/>");
                }
                if (f.Code)
                {
                    sb.Append("<w:rFonts w:ascii=\"Consolas\" w:hAnsi=\"Consolas\" w:eastAsia=\"Consolas\" w:cs=\"Consolas\"/>");
                }
                if (f.Bold) sb.Append("<w:b/><w:bCs/>");
                if (f.Italic) sb.Append("<w:i/><w:iCs/>");
                if (f.Strike) sb.Append("<w:strike/>");
                if (f.Code) sb.Append("<w:sz w:val=\"20\"/><w:szCs w:val=\"20\"/>");
                if (f.Highlight) sb.Append("<w:highlight w:val=\"yellow\"/>");
                if (f.Underline) sb.Append("<w:u w:val=\"single\"/>");
                if (f.Code) sb.Append("<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"F2F2F2\"/>");
                if (f.VertAlign != null) sb.Append($"<w:vertAlign w:val=\"{f.VertAlign}\"/>");
                sb.Append("</w:rPr>");
                return sb.ToString();
            }

            private void AppendText(StringBuilder sb, string? text, Fmt fmt)
            {
                text = Clean(text);
                if (text.Length == 0)
                {
                    return;
                }

                string rPr = RPr(fmt);
                var buffer = new StringBuilder();

                void Flush()
                {
                    if (buffer.Length == 0)
                    {
                        return;
                    }
                    sb.Append("<w:r>").Append(rPr).Append("<w:t xml:space=\"preserve\">")
                      .Append(Escape(buffer.ToString())).Append("</w:t></w:r>");
                    buffer.Clear();
                }

                foreach (char c in text)
                {
                    switch (c)
                    {
                        case '\r':
                            break;
                        case '\t':
                            Flush();
                            sb.Append("<w:r>").Append(rPr).Append("<w:tab/></w:r>");
                            break;
                        case '\n':
                            Flush();
                            sb.Append("<w:r>").Append(rPr).Append("<w:br/></w:r>");
                            break;
                        default:
                            buffer.Append(c);
                            break;
                    }
                }
                Flush();
            }

        }
    }
}
