using MyMDEditor.Services;

namespace MyMDEditor.Tests
{
    [TestClass]
    public sealed class MarkdownRenderingServiceTests
    {
        private readonly MarkdownRenderingService _service = new();

        private RenderResult Render(string markdown, bool map = true) =>
            _service.RenderAsync(markdown, map).GetAwaiter().GetResult();

        [TestMethod]
        public void Render_Heading_HasSourceLineAndOffsetAttributes()
        {
            var result = Render("intro\n\n## Title\n");

            StringAssert.Contains(result.BodyHtml, "data-sl=\"2\"");
            StringAssert.Contains(result.BodyHtml, "data-el=\"2\"");
            StringAssert.Contains(result.BodyHtml, "data-ss=\"7\"");
        }

        [TestMethod]
        public void Render_MultiLineParagraph_CoversAllLines()
        {
            var result = Render("line one\nline two\nline three\n");

            StringAssert.Contains(result.BodyHtml, "<p data-sl=\"0\" data-el=\"2\"");
        }

        [TestMethod]
        public void Render_List_ItemsAndNestedItemsCarryOwnLines()
        {
            var result = Render("- a\n  - nested\n- b\n");

            StringAssert.Contains(result.BodyHtml, "<li data-sl=\"0\" data-el=\"1\"");
            StringAssert.Contains(result.BodyHtml, "<li data-sl=\"1\" data-el=\"1\"");
            StringAssert.Contains(result.BodyHtml, "<li data-sl=\"2\" data-el=\"2\"");
        }

        [TestMethod]
        public void Render_Table_RowsCarryOwnLines()
        {
            var result = Render("| A | B |\n| - | - |\n| 1 | 2 |\n");

            StringAssert.Contains(result.BodyHtml, "<table data-sl=\"0\"");
            StringAssert.Contains(result.BodyHtml, "<tr data-sl=\"2\"");
        }

        [TestMethod]
        public void Render_Blockquote_CodeBlock_ThematicBreak_AreMapped()
        {
            var result = Render("> quote\n\n```cs\nvar x = 1;\n```\n\n---\n");

            StringAssert.Contains(result.BodyHtml, "<blockquote data-sl=\"0\"");
            StringAssert.Contains(result.BodyHtml, "<code class=\"language-cs\" data-sl=\"2\" data-el=\"4\"");
            StringAssert.Contains(result.BodyHtml, "<hr data-sl=\"6\"");
        }

        [TestMethod]
        public void Render_ImageAndLink_ParagraphIsMapped()
        {
            var result = Render("text ![alt](a.png) and [link](http://x)\n");

            StringAssert.Contains(result.BodyHtml, "<p data-sl=\"0\"");
            StringAssert.Contains(result.BodyHtml, "<img src=\"a.png\"");
        }

        [TestMethod]
        public void Render_CrLfInput_OffsetsMatchOriginalText()
        {
            var text = "a\r\n\r\n# H\r\n";
            var result = Render(text);

            var offset = text.IndexOf("# H", StringComparison.Ordinal);
            StringAssert.Contains(result.BodyHtml, $"data-ss=\"{offset}\"");
            StringAssert.Contains(result.BodyHtml, "data-sl=\"2\"");
        }

        [TestMethod]
        public void Render_WithoutSourceMap_OmitsDataAttributes()
        {
            var result = Render("# H\n\ntext", map: false);

            Assert.DoesNotContain("data-sl", result.BodyHtml);
        }

        [TestMethod]
        public void Render_Outline_ListsHeadingsWithLevelsAndLines()
        {
            var result = Render("# One\n\ntext\n\n## Two *em*\n\n```\n# not a heading\n```\n\n### Three\n");

            CollectionAssert.AreEqual(
                new[] { "One", "Two em", "Three" },
                result.Outline.Select(o => o.Title).ToArray());
            CollectionAssert.AreEqual(new[] { 1, 2, 3 }, result.Outline.Select(o => o.Level).ToArray());
            CollectionAssert.AreEqual(new[] { 0, 4, 10 }, result.Outline.Select(o => o.Line).ToArray());
        }

        [TestMethod]
        public void Render_SetextHeading_IsInOutline()
        {
            var result = Render("Title\n=====\n\nSub\n---\n");

            Assert.HasCount(2, result.Outline);
            Assert.AreEqual(1, result.Outline[0].Level);
            Assert.AreEqual(2, result.Outline[1].Level);
        }

        [TestMethod]
        public void Render_EmptyOrNull_ReturnsEmptyResult()
        {
            Assert.AreEqual(string.Empty, Render(string.Empty).BodyHtml.Trim());
            Assert.AreEqual(string.Empty, Render(null!).BodyHtml.Trim());
        }

        [TestMethod]
        public async Task RenderAsync_Cancelled_Throws()
        {
            using var cts = new CancellationTokenSource();
            cts.Cancel();

            await Assert.ThrowsAsync<TaskCanceledException>(() => _service.RenderAsync("# x", true, cts.Token));
        }

        [TestMethod]
        public async Task RenderToHtmlAsync_ProducesStandaloneDocumentWithoutScripts()
        {
            var html = await _service.RenderToHtmlAsync("# Hello\n\nworld");

            StringAssert.Contains(html, "<!DOCTYPE html>");
            StringAssert.Contains(html, "<title>Hello</title>");
            StringAssert.Contains(html, "<h1");
            Assert.DoesNotContain("<script", html);
            Assert.DoesNotContain("data-sl", html);
        }

        [TestMethod]
        public void Render_LargeDocument_CompletesQuickly()
        {
            var text = string.Concat(Enumerable.Range(0, 20_000).Select(i => $"## Heading {i}\n\nParagraph {i} with *emphasis*.\n\n"));

            var sw = System.Diagnostics.Stopwatch.StartNew();
            var result = Render(text);
            sw.Stop();

            Assert.HasCount(20_000, result.Outline);
            Assert.IsLessThan(10_000, sw.ElapsedMilliseconds, "Rendering 20k sections should stay well under 10s.");
        }
    }
}
