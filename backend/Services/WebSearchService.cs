using System.Text;
using System.Text.Json;

namespace ChatApi.Services;

public class WebSearchService
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<WebSearchService> _logger;

    public WebSearchService(IHttpClientFactory httpFactory, ILogger<WebSearchService> logger)
    {
        _httpFactory = httpFactory;
        _logger = logger;
    }

    public async Task<string> SearchAsync(string query)
    {
        if (string.IsNullOrWhiteSpace(query))
            return "No search query provided.";

        var client = _httpFactory.CreateClient();
        var sections = new List<string>();

        try
        {
            var ddgUrl =
                $"https://api.duckduckgo.com/?q={Uri.EscapeDataString(query)}&format=json&no_html=1&skip_disambig=1";
            var ddgJson = await client.GetStringAsync(ddgUrl);
            using var ddg = JsonDocument.Parse(ddgJson);
            var root = ddg.RootElement;

            if (root.TryGetProperty("Heading", out var heading) && heading.GetString() is { Length: > 0 } h)
                sections.Add($"Topic: {h}");

            if (root.TryGetProperty("AbstractText", out var abs) && abs.GetString() is { Length: > 0 } abstractText)
            {
                sections.Add($"Summary: {abstractText}");
                if (root.TryGetProperty("AbstractURL", out var url) && url.GetString() is { Length: > 0 } abstractUrl)
                    sections.Add($"Source: {abstractUrl}");
            }

            if (root.TryGetProperty("RelatedTopics", out var topics))
            {
                var related = new List<string>();
                foreach (var topic in topics.EnumerateArray().Take(5))
                {
                    if (topic.TryGetProperty("Text", out var text) && text.GetString() is { Length: > 0 } t)
                        related.Add($"- {t}");
                }
                if (related.Count > 0)
                    sections.Add("Related:\n" + string.Join("\n", related));
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "DuckDuckGo search failed for {Query}", query);
        }

        try
        {
            var wikiSearchUrl =
                $"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={Uri.EscapeDataString(query)}&format=json&origin=*&srlimit=2";
            var wikiSearchJson = await client.GetStringAsync(wikiSearchUrl);
            using var wikiSearch = JsonDocument.Parse(wikiSearchJson);
            var searchItems = wikiSearch.RootElement
                .GetProperty("query")
                .GetProperty("search");

            foreach (var item in searchItems.EnumerateArray().Take(2))
            {
                var title = item.GetProperty("title").GetString();
                if (string.IsNullOrWhiteSpace(title)) continue;

                var summaryUrl =
                    $"https://en.wikipedia.org/api/rest_v1/page/summary/{Uri.EscapeDataString(title.Replace(' ', '_'))}";
                var summaryJson = await client.GetStringAsync(summaryUrl);
                using var summary = JsonDocument.Parse(summaryJson);
                var extract = summary.RootElement.TryGetProperty("extract", out var ex)
                    ? ex.GetString()
                    : null;
                if (!string.IsNullOrWhiteSpace(extract))
                {
                    sections.Add($"Wikipedia ({title}): {extract}");
                    if (summary.RootElement.TryGetProperty("content_urls", out var urls) &&
                        urls.TryGetProperty("desktop", out var desktop) &&
                        desktop.TryGetProperty("page", out var page))
                    {
                        var pageUrl = page.GetString();
                        if (!string.IsNullOrWhiteSpace(pageUrl))
                            sections.Add($"Wikipedia URL: {pageUrl}");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Wikipedia search failed for {Query}", query);
        }

        if (sections.Count == 0)
            return $"No web results found for \"{query}\". Try a more specific search term or company name.";

        return string.Join("\n\n", sections);
    }
}
