using System.Text.Json;
using System.Text.RegularExpressions;

namespace ChatApi.Services;

public record LinkPreviewData(string Url, string? Title, string? Description, string? Image);

public class LinkPreviewService
{
    private static readonly Regex UrlRegex = new(@"https?://[^\s<>""']+", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<LinkPreviewService> _logger;

    public LinkPreviewService(IHttpClientFactory httpFactory, ILogger<LinkPreviewService> logger)
    {
        _httpFactory = httpFactory;
        _logger = logger;
    }

    public string? ExtractFirstUrl(string? content)
    {
        if (string.IsNullOrWhiteSpace(content)) return null;
        var match = UrlRegex.Match(content);
        return match.Success ? match.Value.TrimEnd('.', ',', ';', ')') : null;
    }

    public async Task<LinkPreviewData?> FetchPreviewAsync(string url)
    {
        if (!IsSafeUrl(url)) return null;

        try
        {
            if (IsYouTubeUrl(url))
                return await FetchYouTubePreviewAsync(url);

            return await FetchOpenGraphPreviewAsync(url);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch link preview for {Url}", url);
            return new LinkPreviewData(url, GetDomain(url), null, null);
        }
    }

    public async Task<LinkPreviewData?> FetchFromContentAsync(string? content)
    {
        var url = ExtractFirstUrl(content);
        return url == null ? null : await FetchPreviewAsync(url);
    }

    private async Task<LinkPreviewData?> FetchYouTubePreviewAsync(string url)
    {
        var client = _httpFactory.CreateClient("LinkPreview");
        var oembedUrl = $"https://www.youtube.com/oembed?url={Uri.EscapeDataString(url)}&format=json";
        var response = await client.GetAsync(oembedUrl);
        if (!response.IsSuccessStatusCode)
            return await FetchOpenGraphPreviewAsync(url);

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var title = root.TryGetProperty("title", out var t) ? t.GetString() : "YouTube";
        var image = root.TryGetProperty("thumbnail_url", out var thumb) ? thumb.GetString() : null;
        var author = root.TryGetProperty("author_name", out var a) ? a.GetString() : null;

        return new LinkPreviewData(url, title, author, image);
    }

    private async Task<LinkPreviewData?> FetchOpenGraphPreviewAsync(string url)
    {
        var client = _httpFactory.CreateClient("LinkPreview");
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (compatible; KryptosChat/1.0)");

        using var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode)
            return new LinkPreviewData(url, GetDomain(url), null, null);

        var html = await response.Content.ReadAsStringAsync();
        if (html.Length > 500_000) html = html[..500_000];

        var title = ExtractMeta(html, "og:title") ?? ExtractMeta(html, "twitter:title") ?? ExtractTitleTag(html) ?? GetDomain(url);
        var description = ExtractMeta(html, "og:description") ?? ExtractMeta(html, "twitter:description") ?? ExtractMeta(html, "description");
        var image = ExtractMeta(html, "og:image") ?? ExtractMeta(html, "twitter:image");

        if (image != null && !image.StartsWith("http", StringComparison.OrdinalIgnoreCase))
        {
            if (Uri.TryCreate(new Uri(url), image, out var absolute))
                image = absolute.ToString();
            else
                image = null;
        }

        return new LinkPreviewData(url, title, description, image);
    }

    private static string? ExtractMeta(string html, string property)
    {
        var patterns = new[]
        {
            $@"<meta[^>]+property=[""']{Regex.Escape(property)}[""'][^>]+content=[""']([^""']+)[""']",
            $@"<meta[^>]+content=[""']([^""']+)[""'][^>]+property=[""']{Regex.Escape(property)}[""']",
            $@"<meta[^>]+name=[""']{Regex.Escape(property)}[""'][^>]+content=[""']([^""']+)[""']",
            $@"<meta[^>]+content=[""']([^""']+)[""'][^>]+name=[""']{Regex.Escape(property)}[""']"
        };

        foreach (var pattern in patterns)
        {
            var match = Regex.Match(html, pattern, RegexOptions.IgnoreCase | RegexOptions.Singleline);
            if (match.Success)
                return DecodeHtml(match.Groups[1].Value.Trim());
        }
        return null;
    }

    private static string? ExtractTitleTag(string html)
    {
        var match = Regex.Match(html, @"<title[^>]*>([^<]+)</title>", RegexOptions.IgnoreCase);
        return match.Success ? DecodeHtml(match.Groups[1].Value.Trim()) : null;
    }

    private static string DecodeHtml(string value) =>
        System.Net.WebUtility.HtmlDecode(value);

    private static bool IsYouTubeUrl(string url) =>
        url.Contains("youtube.com", StringComparison.OrdinalIgnoreCase) ||
        url.Contains("youtu.be", StringComparison.OrdinalIgnoreCase);

    private static bool IsSafeUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme is not "http" and not "https") return false;

        var host = uri.Host.ToLowerInvariant();
        if (host is "localhost" or "127.0.0.1" or "::1") return false;
        if (host.StartsWith("10.") || host.StartsWith("192.168.") || host.StartsWith("172.")) return false;
        if (host.EndsWith(".local")) return false;

        return true;
    }

    private static string GetDomain(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.Host : url;
}
