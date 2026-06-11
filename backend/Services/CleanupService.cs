using ChatApi.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace ChatApi.Services;

public class CleanupService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<CleanupService> _logger;

    public CleanupService(IServiceProvider services, ILogger<CleanupService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCleanupAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Cleanup job skipped — check database connection string in appsettings.json");
            }

            await Task.Delay(TimeSpan.FromMinutes(15), stoppingToken);
        }
    }

    private async Task RunCleanupAsync()
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<DatabaseService>();
        var storage = scope.ServiceProvider.GetRequiredService<StorageService>();
        var hub = scope.ServiceProvider.GetRequiredService<IHubContext<ChatHub>>();

        var attachmentUrls = await db.GetOldAttachmentUrlsAsync();
        foreach (var url in attachmentUrls)
        {
            try { await storage.DeleteByUrlAsync(url); }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to delete attachment {Url}", url); }
        }

        var deletedMessages = await db.DeleteOldMessagesAsync();
        var expiredGuests = await db.GetExpiredGuestIdsAsync();

        foreach (var guestId in expiredGuests)
        {
            await db.DeleteUserAsync(guestId);
            _logger.LogInformation("Deleted expired guest {GuestId}", guestId);
        }

        if (deletedMessages > 0 || expiredGuests.Count > 0)
        {
            await hub.Clients.All.SendAsync("ChatReset");
            _logger.LogInformation("Cleanup: {Messages} messages, {Guests} guests", deletedMessages, expiredGuests.Count);
        }
    }
}
