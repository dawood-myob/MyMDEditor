using MyMDEditor.Services.Editing;

namespace MyMDEditor.Tests
{
    [TestClass]
    public sealed class LineOperationsTests
    {
        [TestMethod]
        [DataRow("- item", "\n- ")]
        [DataRow("  * nested", "\n  * ")]
        [DataRow("+ plus", "\n+ ")]
        [DataRow("1. one", "\n2. ")]
        [DataRow("9) nine", "\n10) ")]
        [DataRow("- [x] done", "\n- [ ] ")]
        [DataRow("> quote", "\n> ")]
        [DataRow("> > deep", "\n> > ")]
        public void GetEnterEdit_ContinuesListsAndQuotes(string line, string expected)
        {
            var edit = LineOperations.GetEnterEdit(line, line.Length);

            Assert.IsNotNull(edit);
            Assert.AreEqual(expected, edit.Value.InsertText);
            Assert.IsFalse(edit.Value.ClearLine);
        }

        [TestMethod]
        [DataRow("- ")]
        [DataRow("1. ")]
        [DataRow("- [ ] ")]
        [DataRow("> ")]
        public void GetEnterEdit_EmptyItem_EndsList(string line)
        {
            var edit = LineOperations.GetEnterEdit(line, line.Length);

            Assert.IsNotNull(edit);
            Assert.IsTrue(edit.Value.ClearLine);
        }

        [TestMethod]
        public void GetEnterEdit_PlainLineOrCaretInMarker_ReturnsNull()
        {
            Assert.IsNull(LineOperations.GetEnterEdit("plain text", 5));
            Assert.IsNull(LineOperations.GetEnterEdit("- item", 1));
            Assert.IsNull(LineOperations.GetEnterEdit("-item", 5));
        }

        [TestMethod]
        public void IndentAndOutdent()
        {
            Assert.AreEqual("  - a", LineOperations.IndentLine("- a"));
            Assert.AreEqual("   1. a", LineOperations.IndentLine("1. a"));
            Assert.AreEqual("    text", LineOperations.IndentLine("text"));
            Assert.AreEqual(string.Empty, LineOperations.IndentLine(string.Empty));
            Assert.AreEqual("- a", LineOperations.OutdentLine("  - a"));
            Assert.AreEqual("  x", LineOperations.OutdentLine("      x"));
            Assert.AreEqual("x", LineOperations.OutdentLine("\tx"));
        }

        [TestMethod]
        public void PrefixLines_TogglesAcrossSelection()
        {
            var text = "a\nb\nc";

            var added = LineOperations.PrefixLines(text, 0, 3, "- ");
            Assert.AreEqual(new TextEdit(0, 3, "- a\n- b"), added);

            var removed = LineOperations.PrefixLines("- a\n- b", 0, 7, "- ");
            Assert.AreEqual("a\nb", removed.Text);
        }

        [TestMethod]
        public void PrefixLines_SelectionEndingAtLineStart_ExcludesThatLine()
        {
            var edit = LineOperations.PrefixLines("a\nb\nc", 0, 2, "> ");

            Assert.AreEqual("> a", edit.Text);
            Assert.AreEqual(1, edit.Length);
        }

        [TestMethod]
        public void PrefixLines_Heading_ReplacesOtherLevel()
        {
            var prefixes = new[] { "# ", "## ", "### " };

            var edit = LineOperations.PrefixLines("### Title", 2, 0, "# ", prefixes);
            Assert.AreEqual("# Title", edit.Text);

            var toggledOff = LineOperations.PrefixLines("# Title", 2, 0, "# ", prefixes);
            Assert.AreEqual("Title", toggledOff.Text);
        }

        [TestMethod]
        public void NumberLines_NumbersAndToggles()
        {
            var numbered = LineOperations.NumberLines("x\ny\nz", 0, 5);
            Assert.AreEqual("1. x\n2. y\n3. z", numbered.Text);

            var plain = LineOperations.NumberLines(numbered.Text, 0, numbered.Text.Length);
            Assert.AreEqual("x\ny\nz", plain.Text);
        }
    }

    [TestClass]
    public sealed class TableEditorTests
    {
        private static readonly string[] Table =
        {
            "intro",
            "| Name | Age |",
            "|:--|--:|",
            "| Alexander | 7 |",
            "| Bo | 42 |",
            "",
        };

        [TestMethod]
        public void FindTable_LocatesBlock()
        {
            Assert.AreEqual((1, 4), TableEditor.FindTable(Table, 3));
            Assert.IsNull(TableEditor.FindTable(Table, 0));
            Assert.IsNull(TableEditor.FindTable(new[] { "a | b", "c | d" }, 0), "No delimiter row means no table.");
        }

        [TestMethod]
        public void IsDelimiterRow_RecognisesAlignmentSyntax()
        {
            Assert.IsTrue(TableEditor.IsDelimiterRow("| --- | :-: | --: |"));
            Assert.IsTrue(TableEditor.IsDelimiterRow("---|---"));
            Assert.IsFalse(TableEditor.IsDelimiterRow("| a | --- |"));
        }

        [TestMethod]
        public void SplitCells_HandlesEscapedPipesAndCodeSpans()
        {
            var cells = TableEditor.SplitCells(@"| a \| b | `x|y` | c |").Select(c => c.Trim()).ToArray();

            CollectionAssert.AreEqual(new[] { @"a \| b", "`x|y`", "c" }, cells);
        }

        [TestMethod]
        public void SplitCells_WithoutOuterPipes()
        {
            CollectionAssert.AreEqual(new[] { "a ", " b" }, TableEditor.SplitCells("a | b"));
        }

        [TestMethod]
        public void Format_AlignsColumnsAndPreservesAlignment()
        {
            var formatted = TableEditor.Format(Table.Skip(1).Take(4).ToList());

            CollectionAssert.AreEqual(new[]
            {
                "| Name      | Age |",
                "| :-------- | --: |",
                "| Alexander |   7 |",
                "| Bo        |  42 |",
            }, formatted);
        }

        [TestMethod]
        public void Format_PadsMissingCells()
        {
            var formatted = TableEditor.Format(new[] { "| a | b |", "|---|---|", "| 1 |" });

            Assert.AreEqual("| 1   |     |", formatted[2]);
        }

        [TestMethod]
        public void BuildEmptyRow_MatchesColumnCount()
        {
            Assert.AreEqual("|  |  |  |", TableEditor.BuildEmptyRow("| a | b | c |"));
        }

        [TestMethod]
        public void Navigate_ForwardMovesToNextCellThenNextRow_SkippingDelimiter()
        {
            var lines = new[] { "| a | b |", "|---|---|", "| c | d |" };

            var next = TableEditor.Navigate(lines, 0, 2, 0, 2, forward: true);
            Assert.AreEqual((0, new CellRange(6, 1)), next);

            var wrap = TableEditor.Navigate(lines, 0, 2, 0, 6, forward: true);
            Assert.AreEqual((2, new CellRange(2, 1)), wrap);

            Assert.IsNull(TableEditor.Navigate(lines, 0, 2, 2, 7, forward: true));
        }

        [TestMethod]
        public void Navigate_BackwardMovesToPreviousRowLastCell()
        {
            var lines = new[] { "| a | b |", "|---|---|", "| c | d |" };

            var previous = TableEditor.Navigate(lines, 0, 2, 2, 2, forward: false);

            Assert.AreEqual((0, new CellRange(6, 1)), previous);
            Assert.IsNull(TableEditor.Navigate(lines, 0, 2, 0, 2, forward: false));
        }

        [TestMethod]
        public void GetCellRanges_EmptyCell_ParksCaretInsidePadding()
        {
            var ranges = TableEditor.GetCellRanges("|  | b |");

            Assert.AreEqual(new CellRange(2, 0), ranges[0]);
        }
    }
}
