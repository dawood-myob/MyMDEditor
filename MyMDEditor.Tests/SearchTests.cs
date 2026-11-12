using MyMDEditor.Services.Search;

namespace MyMDEditor.Tests
{
    [TestClass]
    public sealed class SearchEngineTests
    {
        private const string Text = "Foo bar foo\nfood FOO\n";

        [TestMethod]
        public void Find_CaseInsensitive_FindsAllCasings()
        {
            var result = SearchEngine.Find(Text, new SearchOptions("foo"));

            CollectionAssert.AreEqual(new[] { 0, 8, 12, 17 }, result.Matches.Select(m => m.Start).ToArray());
        }

        [TestMethod]
        public void Find_CaseSensitive_OnlyExactCase()
        {
            var result = SearchEngine.Find(Text, new SearchOptions("foo", CaseSensitive: true));

            CollectionAssert.AreEqual(new[] { 8, 12 }, result.Matches.Select(m => m.Start).ToArray());
        }

        [TestMethod]
        public void Find_WholeWord_ExcludesPartialWords()
        {
            var result = SearchEngine.Find(Text, new SearchOptions("foo", WholeWord: true));

            CollectionAssert.AreEqual(new[] { 0, 8, 17 }, result.Matches.Select(m => m.Start).ToArray());
        }

        [TestMethod]
        public void Find_WholeWordCaseSensitive_Combines()
        {
            var result = SearchEngine.Find(Text, new SearchOptions("foo", CaseSensitive: true, WholeWord: true));

            Assert.HasCount(1, result.Matches);
            Assert.AreEqual(8, result.Matches[0].Start);
        }

        [TestMethod]
        public void Find_Regex_MatchesPattern()
        {
            var result = SearchEngine.Find("a1 b22 c333", new SearchOptions(@"\d+", UseRegex: true));

            CollectionAssert.AreEqual(new[] { 1, 2, 3 }, result.Matches.Select(m => m.Length).ToArray());
        }

        [TestMethod]
        public void Find_RegexAnchors_AreMultiline()
        {
            var result = SearchEngine.Find("# a\ntext\n# b", new SearchOptions("^#", UseRegex: true));

            Assert.HasCount(2, result.Matches);
        }

        [TestMethod]
        public void Find_PlainTextWithRegexMetacharacters_IsLiteral()
        {
            var result = SearchEngine.Find("a.b axb (c)", new SearchOptions("a.b"));

            Assert.HasCount(1, result.Matches);
            Assert.HasCount(1, SearchEngine.Find("a.b axb (c)", new SearchOptions("(c)")).Matches);
        }

        [TestMethod]
        public void Find_InvalidRegex_ReturnsErrorNotException()
        {
            var result = SearchEngine.Find("abc", new SearchOptions("(", UseRegex: true));

            Assert.IsEmpty(result.Matches);
            Assert.IsNotNull(result.Error);
            Assert.IsNotNull(SearchEngine.Validate(new SearchOptions("[", UseRegex: true)));
            Assert.IsNull(SearchEngine.Validate(new SearchOptions("[a]", UseRegex: true)));
        }

        [TestMethod]
        public void Find_ZeroLengthRegex_IsIgnored()
        {
            var result = SearchEngine.Find("abc", new SearchOptions("x*", UseRegex: true));

            Assert.IsEmpty(result.Matches);
        }

        [TestMethod]
        public void Find_EmptyQueryOrText_ReturnsEmpty()
        {
            Assert.IsEmpty(SearchEngine.Find(Text, new SearchOptions(string.Empty)).Matches);
            Assert.IsEmpty(SearchEngine.Find(string.Empty, new SearchOptions("a")).Matches);
        }

        [TestMethod]
        public void Find_Overlapping_DoesNotDoubleCount()
        {
            Assert.HasCount(2, SearchEngine.Find("aaaa", new SearchOptions("aa")).Matches);
        }

        [TestMethod]
        public void Find_MaxMatches_TruncatesAndFlags()
        {
            var result = SearchEngine.Find(new string('a', 50), new SearchOptions("a"), maxMatches: 10);

            Assert.HasCount(10, result.Matches);
            Assert.IsTrue(result.Truncated);
        }

        [TestMethod]
        public void Find_LargeDocument_IsFast()
        {
            var text = string.Concat(Enumerable.Repeat("lorem ipsum dolor sit amet consectetur\n", 100_000));

            var sw = System.Diagnostics.Stopwatch.StartNew();
            var result = SearchEngine.Find(text, new SearchOptions("dolor", WholeWord: true));
            sw.Stop();

            Assert.HasCount(100_000, result.Matches);
            Assert.IsLessThan(3_000, sw.ElapsedMilliseconds);
        }

        [TestMethod]
        public void Find_Cancelled_Throws()
        {
            using var cts = new CancellationTokenSource();
            cts.Cancel();

            Assert.ThrowsExactly<OperationCanceledException>(() =>
                SearchEngine.Find(new string('a', 10_000), new SearchOptions("a"), cancellationToken: cts.Token));
        }

        [TestMethod]
        public void ReplaceAll_PlainText_ReplacesEveryMatch()
        {
            var (text, count) = SearchEngine.ReplaceAll(Text, new SearchOptions("foo", WholeWord: true), "baz");

            Assert.AreEqual(3, count);
            Assert.AreEqual("baz bar baz\nfood baz\n", text);
        }

        [TestMethod]
        public void ReplaceAll_RegexWithGroups_ExpandsSubstitutions()
        {
            var (text, count) = SearchEngine.ReplaceAll("John Smith", new SearchOptions(@"(\w+) (\w+)", UseRegex: true), "$2, $1");

            Assert.AreEqual(1, count);
            Assert.AreEqual("Smith, John", text);
        }

        [TestMethod]
        public void ReplaceAll_NoMatch_ReturnsOriginal()
        {
            var (text, count) = SearchEngine.ReplaceAll("abc", new SearchOptions("z"), "y");

            Assert.AreEqual(0, count);
            Assert.AreEqual("abc", text);
        }

        [TestMethod]
        public void GetReplacement_Regex_ExpandsForSingleMatch()
        {
            var options = new SearchOptions(@"(\d+)", UseRegex: true);
            var text = "x 42 y";
            var match = SearchEngine.Find(text, options).Matches[0];

            Assert.AreEqual("<42>", SearchEngine.GetReplacement(text, match, options, "<$1>"));
            Assert.AreEqual("<$1>", SearchEngine.GetReplacement(text, match, options with { UseRegex = false }, "<$1>"));
        }
    }

    [TestClass]
    public sealed class SearchSessionTests
    {
        private static SearchSession Create(params int[] starts) =>
            new(new SearchResult(starts.Select(s => new MatchRange(s, 1)).ToList()));

        [TestMethod]
        public void MoveNext_WrapsAround()
        {
            var session = Create(1, 5, 9);

            session.MoveNext();
            session.MoveNext();
            session.MoveNext();
            Assert.AreEqual(2, session.CurrentIndex);
            session.MoveNext();
            Assert.AreEqual(0, session.CurrentIndex);
        }

        [TestMethod]
        public void MovePrevious_FromNone_GoesToLast()
        {
            var session = Create(1, 5, 9);

            session.MovePrevious();

            Assert.AreEqual(2, session.CurrentIndex);
        }

        [TestMethod]
        public void SelectNearestForward_PicksFirstAtOrAfterOffset_AndWraps()
        {
            var session = Create(1, 5, 9);

            session.SelectNearestForward(5);
            Assert.AreEqual(1, session.CurrentIndex);
            session.SelectNearestForward(10);
            Assert.AreEqual(0, session.CurrentIndex);
        }

        [TestMethod]
        public void SelectNearestBackward_PicksLastBeforeOffset_AndWraps()
        {
            var session = Create(1, 5, 9);

            session.SelectNearestBackward(5);
            Assert.AreEqual(0, session.CurrentIndex);
            session.SelectNearestBackward(0);
            Assert.AreEqual(2, session.CurrentIndex);
        }

        [TestMethod]
        public void Describe_FormatsCounts()
        {
            var session = Create(Enumerable.Range(0, 23).ToArray());
            Assert.AreEqual("23 matches", session.Describe());

            session.Select(6);
            Assert.AreEqual("7 of 23 matches", session.Describe());

            Assert.AreEqual("No results", Create().Describe());
            Assert.AreEqual("1 match", Create(3).Describe());
        }

        [TestMethod]
        public void Describe_ErrorAndTruncated()
        {
            Assert.AreEqual("bad", new SearchSession(new SearchResult(Array.Empty<MatchRange>(), "bad")).Describe());
            var truncated = new SearchSession(new SearchResult(new[] { new MatchRange(0, 1), new MatchRange(2, 1) }, Truncated: true));
            Assert.AreEqual("2+ matches", truncated.Describe());
        }

        [TestMethod]
        public void Navigation_OnEmpty_ReturnsFalse()
        {
            var session = Create();

            Assert.IsFalse(session.MoveNext());
            Assert.IsFalse(session.MovePrevious());
            Assert.IsFalse(session.SelectNearestForward(0));
            Assert.IsNull(session.Current);
        }
    }
}
