using System.IO.Compression;
using System.Xml.Linq;
using MyMDEditor.Services.Export;

namespace MyMDEditor.Tests
{
    [TestClass]
    public class DocxExporterTests
    {
        private static readonly XNamespace W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        private static readonly XNamespace R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        private static readonly XNamespace Pkg = "http://schemas.openxmlformats.org/package/2006/relationships";

        private static Dictionary<string, string> ReadParts(byte[] bytes)
        {
            var parts = new Dictionary<string, string>();
            using var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
            foreach (var entry in zip.Entries)
            {
                using var reader = new StreamReader(entry.Open());
                parts[entry.FullName] = reader.ReadToEnd();
            }
            return parts;
        }

        private static XDocument Document(string markdown, out Dictionary<string, string> parts)
        {
            parts = ReadParts(DocxExporter.Build(markdown));
            return XDocument.Parse(parts["word/document.xml"]);
        }

        private static string BodyText(XDocument doc) =>
            string.Concat(doc.Descendants(W + "t").Select(t => t.Value));

        [TestMethod]
        public void Build_ContainsRequiredPartsAndAllPartsAreWellFormed()
        {
            var parts = ReadParts(DocxExporter.Build("# Hello", "My Title"));

            foreach (var name in new[] { "[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels", "docProps/core.xml" })
            {
                Assert.IsTrue(parts.ContainsKey(name), $"Missing part {name}");
                XDocument.Parse(parts[name]);
            }
            StringAssert.Contains(parts["docProps/core.xml"], "My Title");
        }

        [TestMethod]
        public void Build_EmptyMarkdown_ProducesValidPackage()
        {
            var doc = Document(string.Empty, out var parts);

            Assert.IsNotNull(doc.Root);
            Assert.IsTrue(parts.ContainsKey("word/styles.xml"));
            Assert.IsNotNull(doc.Descendants(W + "body").Single().Element(W + "sectPr"));
        }

        [TestMethod]
        public void Build_Headings_UseHeadingStyles()
        {
            var doc = Document("# One\n\n### Three\n\n###### Six", out _);

            var styles = doc.Descendants(W + "pStyle").Select(s => (string?)s.Attribute(W + "val")).ToList();
            CollectionAssert.AreEqual(new[] { "Heading1", "Heading3", "Heading6" }, styles);
            StringAssert.Contains(BodyText(doc), "Three");
        }

        [TestMethod]
        public void Build_InlineFormatting_ProducesRunProperties()
        {
            var doc = Document("**bold** *italic* ~~gone~~ `code`", out _);

            Assert.IsTrue(doc.Descendants(W + "b").Any());
            Assert.IsTrue(doc.Descendants(W + "i").Any());
            Assert.IsTrue(doc.Descendants(W + "strike").Any());
            var codeRun = doc.Descendants(W + "r").Single(r => r.Value == "code");
            Assert.AreEqual("Consolas", (string?)codeRun.Element(W + "rPr")!.Element(W + "rFonts")!.Attribute(W + "ascii"));
        }

        [TestMethod]
        public void Build_RunPropertiesAppearBeforeRunContent()
        {
            var doc = Document("**bold** text", out _);

            foreach (var run in doc.Descendants(W + "r"))
            {
                var first = run.Elements().First();
                if (run.Element(W + "rPr") != null)
                {
                    Assert.AreEqual(W + "rPr", first.Name);
                }
            }
            foreach (var p in doc.Descendants(W + "p").Where(p => p.Element(W + "pPr") != null))
            {
                Assert.AreEqual(W + "pPr", p.Elements().First().Name);
            }
        }

        [TestMethod]
        public void Build_BulletAndNumberedLists_RenderMarkersAndNesting()
        {
            var doc = Document("- alpha\n  - nested\n- beta\n\n1. first\n2. second", out _);
            string text = BodyText(doc);

            StringAssert.Contains(text, "\u2022");
            StringAssert.Contains(text, "alpha");
            StringAssert.Contains(text, "nested");
            StringAssert.Contains(text, "1.");
            StringAssert.Contains(text, "2.");
            StringAssert.Contains(text, "second");

            var indents = doc.Descendants(W + "ind").Select(i => (int?)i.Attribute(W + "left")).ToList();
            Assert.IsTrue(indents.Contains(720));
            Assert.IsTrue(indents.Contains(1440));
        }

        [TestMethod]
        public void Build_TaskList_UsesCheckboxGlyphs()
        {
            var doc = Document("- [ ] todo\n- [x] done", out _);
            string text = BodyText(doc);

            StringAssert.Contains(text, "\u2610");
            StringAssert.Contains(text, "\u2611");
            StringAssert.Contains(text, "todo");
            StringAssert.Contains(text, "done");
        }

        [TestMethod]
        public void Build_Table_ProducesGridWithBoldHeader()
        {
            var doc = Document("| A | B |\n|---|---|\n| 1 | 2 |", out _);

            var table = doc.Descendants(W + "tbl").Single();
            Assert.AreEqual(W + "tblPr", table.Elements().First().Name);
            Assert.AreEqual(W + "tblGrid", table.Elements().Skip(1).First().Name);
            Assert.AreEqual(2, table.Elements(W + "tr").Count());
            Assert.AreEqual(2, table.Element(W + "tblGrid")!.Elements(W + "gridCol").Count());

            var headerRow = table.Elements(W + "tr").First();
            Assert.IsTrue(headerRow.Descendants(W + "b").Any());
            var bodyRow = table.Elements(W + "tr").Last();
            Assert.IsFalse(bodyRow.Descendants(W + "b").Any());
            Assert.AreEqual("1", bodyRow.Elements(W + "tc").First().Value);
            Assert.AreEqual("2", bodyRow.Elements(W + "tc").Last().Value);
        }

        [TestMethod]
        public void Build_CodeBlock_PreservesLinesWithBreaks()
        {
            var doc = Document("```csharp\nvar a = 1;\n    var b = 2;\n```", out _);

            var paragraph = doc.Descendants(W + "p")
                .Single(p => (string?)p.Element(W + "pPr")?.Element(W + "pStyle")?.Attribute(W + "val") == "CodeBlock");
            Assert.AreEqual(1, paragraph.Descendants(W + "br").Count());
            StringAssert.Contains(paragraph.Value, "var a = 1;");
            StringAssert.Contains(paragraph.Value, "    var b = 2;");
        }

        [TestMethod]
        public void Build_BlockquoteAndThematicBreak_RenderStyledParagraphs()
        {
            var doc = Document("> quoted\n\n---\n\nafter", out _);

            var quote = doc.Descendants(W + "p").Single(p => p.Value == "quoted");
            Assert.AreEqual("Quote", (string?)quote.Element(W + "pPr")!.Element(W + "pStyle")!.Attribute(W + "val"));
            Assert.IsTrue(doc.Descendants(W + "pBdr").Any(b => b.Element(W + "bottom") != null));
        }

        [TestMethod]
        public void Build_SpecialCharactersAndEmoji_AreEscapedAndPreserved()
        {
            var doc = Document("Tom & Jerry <b> > \"q\" \U0001F600 end", out _);
            string text = BodyText(doc);

            StringAssert.Contains(text, "Tom & Jerry");
            StringAssert.Contains(text, ">");
            StringAssert.Contains(text, "\U0001F600");
        }

        [TestMethod]
        public void Build_IllegalXmlCharacters_AreStripped()
        {
            var parts = ReadParts(DocxExporter.Build("a\u0001b\u0008c\uD800d"));

            var doc = XDocument.Parse(parts["word/document.xml"]);
            StringAssert.Contains(BodyText(doc), "abcd");
        }

        [TestMethod]
        public void Build_TextRuns_UseXmlSpacePreserve()
        {
            var doc = Document("hello world", out _);

            XNamespace xml = "http://www.w3.org/XML/1998/namespace";
            Assert.IsTrue(doc.Descendants(W + "t").All(t => (string?)t.Attribute(xml + "space") == "preserve"));
        }

        [TestMethod]
        public void Build_HttpLink_CreatesExternalHyperlinkRelationship()
        {
            var doc = Document("[Example](https://example.com/page?a=1&b=2) and <mailto:me@example.com>", out var parts);

            var rels = XDocument.Parse(parts["word/_rels/document.xml.rels"]);
            var hyperlinkRels = rels.Descendants(Pkg + "Relationship")
                .Where(r => ((string?)r.Attribute("Type"))!.EndsWith("/hyperlink")).ToList();
            Assert.IsTrue(hyperlinkRels.Any(r => (string?)r.Attribute("Target") == "https://example.com/page?a=1&b=2"));
            Assert.IsTrue(hyperlinkRels.All(r => (string?)r.Attribute("TargetMode") == "External"));

            var link = doc.Descendants(W + "hyperlink").First();
            string id = (string)link.Attribute(R + "id")!;
            Assert.IsTrue(hyperlinkRels.Any(r => (string?)r.Attribute("Id") == id));
            Assert.AreEqual("Example", link.Value);
        }

        [TestMethod]
        public void Build_JavascriptLink_ProducesNoRelationshipButKeepsText()
        {
            var doc = Document("[click](javascript:alert(1))", out var parts);

            var rels = XDocument.Parse(parts["word/_rels/document.xml.rels"]);
            Assert.IsFalse(rels.Descendants(Pkg + "Relationship").Any(r => ((string?)r.Attribute("Type"))!.EndsWith("/hyperlink")));
            Assert.IsFalse(doc.Descendants(W + "hyperlink").Any());
            StringAssert.Contains(BodyText(doc), "click");
        }

        [TestMethod]
        public void Build_Image_RendersAltTextPlaceholder()
        {
            var doc = Document("![A cat](cat.png)", out var parts);

            StringAssert.Contains(BodyText(doc), "[Image: A cat]");
            Assert.IsFalse(parts.Keys.Any(k => k.StartsWith("word/media")));
        }

        [TestMethod]
        public void Build_HardLineBreak_EmitsBreak()
        {
            var doc = Document("line one  \nline two", out _);

            Assert.AreEqual(1, doc.Descendants(W + "br").Count());
        }

        [TestMethod]
        public void Build_ComplexDocument_IsWellFormedAndEveryTableCellHasParagraph()
        {
            string markdown = "# Title\n\nText with [link](http://a.b) and ![img](x.png).\n\n> - quote list\n>   1. deep\n\n| L | R |\n|:--|--:|\n| a | |\n\nFootnote[^1].\n\n[^1]: The note.\n\n```\ncode\n```\n";
            var doc = Document(markdown, out var parts);

            foreach (var part in parts.Values)
            {
                XDocument.Parse(part);
            }
            Assert.IsTrue(doc.Descendants(W + "tc").All(tc => tc.Element(W + "p") != null));
            StringAssert.Contains(BodyText(doc), "The note.");
        }

        [TestMethod]
        public async Task ExportAsync_WritesValidDocxFile()
        {
            string dir = Path.Combine(Path.GetTempPath(), "MyMDEditorDocx_" + Guid.NewGuid().ToString("N"));
            string path = Path.Combine(dir, "out.docx");
            try
            {
                await DocxExporter.ExportAsync("# Exported", path, "T");

                Assert.IsTrue(File.Exists(path));
                Assert.AreEqual(1, Directory.GetFiles(dir).Length, "Temp file should not remain.");
                var parts = ReadParts(await File.ReadAllBytesAsync(path));
                StringAssert.Contains(parts["word/document.xml"], "Exported");
            }
            finally
            {
                if (Directory.Exists(dir))
                {
                    Directory.Delete(dir, recursive: true);
                }
            }
        }

        [TestMethod]
        public async Task ExportAsync_CancelledToken_Throws()
        {
            using var cts = new CancellationTokenSource();
            cts.Cancel();
            string path = Path.Combine(Path.GetTempPath(), "MyMDEditorDocx_" + Guid.NewGuid().ToString("N") + ".docx");

            await Assert.ThrowsAsync<OperationCanceledException>(() => DocxExporter.ExportAsync("x", path, null, cts.Token));
            Assert.IsFalse(File.Exists(path));
        }
    }
}
