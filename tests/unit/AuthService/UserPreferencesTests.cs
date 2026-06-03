using AuthService.Application.Preferences.Commands.UpdatePreferences;
using AuthService.Application.Preferences.Queries.GetPreferences;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using AuthService.Infrastructure.Repositories;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests covering the GET /auth/me/preferences query and the
/// PATCH /auth/me/preferences command, including null-field merge behaviour.
/// Uses EF Core InMemory provider to exercise the full handler stack without
/// hitting a real database (unit-test scope).
/// </summary>
[Trait("Category", "Unit")]
public sealed class UserPreferencesTests : IDisposable
{
    private readonly AuthDbContext _db;

    public UserPreferencesTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    // ── helpers ──────────────────────────────────────────────────────

    private static Mock<ICurrentUser> CurrentUser(Guid id)
    {
        var m = new Mock<ICurrentUser>();
        m.SetupGet(x => x.UserId).Returns(id);
        return m;
    }

    private async Task<User> SeedUserWithoutPreference(string lang = "hi")
    {
        var user = new User { PhoneNumber = $"+91{Guid.NewGuid():N}", PreferredLanguage = lang };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user;
    }

    private async Task<User> SeedUserWithPreference(
        string lang = "en", string theme = "DARK",
        bool push = false, bool sms = true, bool email = true, bool wa = true)
    {
        var user = new User { PhoneNumber = $"+91{Guid.NewGuid():N}", PreferredLanguage = lang };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var pref = new UserPreference
        {
            UserId = user.Id,
            PreferredLanguage = lang,
            Theme = theme,
            PushNotificationsEnabled = push,
            SmsNotificationsEnabled = sms,
            EmailNotificationsEnabled = email,
            WhatsappNotificationsEnabled = wa
        };
        // Attach preference via the navigation so the Include() loads it.
        // InMemory provider does not enforce FK, so we add to both sets.
        _db.UserPreferences.Add(pref);
        // Set via reflection since Preference is a private set on the User aggregate.
        typeof(User)
            .GetProperty(nameof(User.Preference))!
            .SetValue(user, pref);
        _db.Users.Update(user);
        await _db.SaveChangesAsync();
        return user;
    }

    private GetPreferencesQueryHandler QueryHandler(Guid userId)
        => new(new UserRepository(_db), CurrentUser(userId).Object);

    private UpdatePreferencesCommandHandler CommandHandler(Guid userId)
        => new(new UserRepository(_db), CurrentUser(userId).Object);

    // ══════════════════════════════════════════════════════════════════
    // GET /auth/me/preferences
    // ══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task GetPreferences_UserWithPreference_ReturnsStoredValues()
    {
        var user = await SeedUserWithPreference(
            lang: "ta", theme: "DARK",
            push: false, sms: true, email: true, wa: true);
        var handler = QueryHandler(user.Id);

        var result = await handler.Handle(new GetPreferencesQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.PreferredLanguage.Should().Be("ta");
        result.Value.Theme.Should().Be("DARK");
        result.Value.PushNotificationsEnabled.Should().BeFalse();
        result.Value.WhatsappNotificationsEnabled.Should().BeTrue();
    }

    [Fact]
    public async Task GetPreferences_UserWithoutPreference_ReturnsDefaults()
    {
        var user = await SeedUserWithoutPreference(lang: "hi");
        var handler = QueryHandler(user.Id);

        var result = await handler.Handle(new GetPreferencesQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.PreferredLanguage.Should().Be("hi", "language comes from user aggregate when no prefs row");
        result.Value.Theme.Should().Be("SYSTEM", "default theme is SYSTEM");
        result.Value.PushNotificationsEnabled.Should().BeTrue("all notifications default to enabled");
        result.Value.SmsNotificationsEnabled.Should().BeTrue();
        result.Value.EmailNotificationsEnabled.Should().BeTrue();
        result.Value.WhatsappNotificationsEnabled.Should().BeFalse("WhatsApp default is disabled");
    }

    [Fact]
    public async Task GetPreferences_UnknownUser_ReturnsNotFound()
    {
        var handler = QueryHandler(Guid.NewGuid());

        var result = await handler.Handle(new GetPreferencesQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().Contain("NotFound");
    }

    // ══════════════════════════════════════════════════════════════════
    // PATCH /auth/me/preferences — full update (all fields provided)
    // ══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task PatchPreferences_AllFieldsProvided_UpdatesAllValues()
    {
        var user = await SeedUserWithPreference(theme: "LIGHT", push: true);
        var handler = CommandHandler(user.Id);

        var result = await handler.Handle(
            new UpdatePreferencesCommand("hi", "DARK", false, false, false, true),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var saved = await _db.UserPreferences.FirstOrDefaultAsync(p => p.UserId == user.Id);
        saved.Should().NotBeNull();
        saved!.Theme.Should().Be("DARK");
        saved.PreferredLanguage.Should().Be("hi");
        saved.PushNotificationsEnabled.Should().BeFalse();
        saved.SmsNotificationsEnabled.Should().BeFalse();
        saved.EmailNotificationsEnabled.Should().BeFalse();
        saved.WhatsappNotificationsEnabled.Should().BeTrue();
    }

    // ══════════════════════════════════════════════════════════════════
    // PATCH /auth/me/preferences — partial update (null = keep existing)
    // ══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task PatchPreferences_NullTheme_KeepsExistingTheme()
    {
        var user = await SeedUserWithPreference(theme: "DARK");
        var handler = CommandHandler(user.Id);

        // Only update language; leave theme as null (= keep existing DARK)
        var result = await handler.Handle(
            new UpdatePreferencesCommand("hi", null, null, null, null, null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var saved = await _db.UserPreferences.FirstOrDefaultAsync(p => p.UserId == user.Id);
        saved!.Theme.Should().Be("DARK", "null theme means keep existing");
        saved.PreferredLanguage.Should().Be("hi");
    }

    [Fact]
    public async Task PatchPreferences_NullLanguage_KeepsExistingLanguage()
    {
        var user = await SeedUserWithPreference(lang: "ta");
        var handler = CommandHandler(user.Id);

        var result = await handler.Handle(
            new UpdatePreferencesCommand(null, "LIGHT", null, null, null, null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var saved = await _db.UserPreferences.FirstOrDefaultAsync(p => p.UserId == user.Id);
        saved!.PreferredLanguage.Should().Be("ta", "null language means keep existing");
        saved.Theme.Should().Be("LIGHT");
    }

    [Fact]
    public async Task PatchPreferences_AllNullFields_ChangesNothing()
    {
        var user = await SeedUserWithPreference(
            lang: "en", theme: "SYSTEM", push: false, sms: false, email: false, wa: false);
        var handler = CommandHandler(user.Id);

        var result = await handler.Handle(
            new UpdatePreferencesCommand(null, null, null, null, null, null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var saved = await _db.UserPreferences.FirstOrDefaultAsync(p => p.UserId == user.Id);
        saved!.PreferredLanguage.Should().Be("en");
        saved.Theme.Should().Be("SYSTEM");
        saved.PushNotificationsEnabled.Should().BeFalse();
        saved.SmsNotificationsEnabled.Should().BeFalse();
        saved.EmailNotificationsEnabled.Should().BeFalse();
        saved.WhatsappNotificationsEnabled.Should().BeFalse();
    }

    [Fact]
    public async Task PatchPreferences_OnlyPushFlag_OnlyChangesPush()
    {
        var user = await SeedUserWithPreference(push: true, sms: true, email: true, wa: false);
        var handler = CommandHandler(user.Id);

        var result = await handler.Handle(
            new UpdatePreferencesCommand(null, null, false, null, null, null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var saved = await _db.UserPreferences.FirstOrDefaultAsync(p => p.UserId == user.Id);
        saved!.PushNotificationsEnabled.Should().BeFalse("push was set to false");
        saved.SmsNotificationsEnabled.Should().BeTrue("sms was not changed");
        saved.EmailNotificationsEnabled.Should().BeTrue("email was not changed");
        saved.WhatsappNotificationsEnabled.Should().BeFalse("wa was not changed");
    }

    // ══════════════════════════════════════════════════════════════════
    // PATCH /auth/me/preferences — user aggregate PreferredLanguage sync
    // ══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task PatchPreferences_WithLanguage_SyncsUserAggregateLanguage()
    {
        var user = await SeedUserWithPreference(lang: "en");
        var handler = CommandHandler(user.Id);

        await handler.Handle(
            new UpdatePreferencesCommand("hi", null, null, null, null, null),
            CancellationToken.None);

        var saved = await _db.Users.FindAsync(user.Id);
        saved!.PreferredLanguage.Should().Be("hi", "user aggregate PreferredLanguage is updated in sync");
    }

    // ══════════════════════════════════════════════════════════════════
    // PATCH /auth/me/preferences — not found
    // ══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task PatchPreferences_UnknownUser_ReturnsNotFound()
    {
        var handler = CommandHandler(Guid.NewGuid());

        var result = await handler.Handle(
            new UpdatePreferencesCommand("en", "LIGHT", true, true, true, false),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().Contain("NotFound");
    }

    // ══════════════════════════════════════════════════════════════════
    // PATCH /auth/me/preferences — no preference row exists yet (regression)
    // Covers the E2E bug: PATCH on a user with no auth.user_preference row
    // used to silently drop theme + all notification flags. Now it must INSERT
    // a new row with ALL merged values persisted.
    // ══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task PatchPreferences_NoExistingRow_CreatesRowWithAllValues()
    {
        // Arrange: user exists but has NO UserPreference row (reproduces seeded admin scenario).
        var user = await SeedUserWithoutPreference(lang: "en");
        var handler = CommandHandler(user.Id);

        // Act: PATCH with specific theme and a notification flag change.
        var result = await handler.Handle(
            new UpdatePreferencesCommand("hi", "DARK", false, true, true, true),
            CancellationToken.None);

        // Assert: command succeeds and a NEW row is persisted with all fields.
        result.IsSuccess.Should().BeTrue("creating a preference row for the first time must succeed");

        var saved = await _db.UserPreferences.FirstOrDefaultAsync(p => p.UserId == user.Id);
        saved.Should().NotBeNull("a new user_preference row must have been INSERTed");
        saved!.Theme.Should().Be("DARK",  "theme must persist — not silently drop");
        saved.PreferredLanguage.Should().Be("hi");
        saved.PushNotificationsEnabled.Should().BeFalse("push flag must persist — not silently drop");
        saved.SmsNotificationsEnabled.Should().BeTrue();
        saved.EmailNotificationsEnabled.Should().BeTrue();
        saved.WhatsappNotificationsEnabled.Should().BeTrue();
    }

    [Fact]
    public async Task PatchPreferences_NoExistingRow_NullFields_UsesDefaultsForUnspecified()
    {
        // Only theme is provided; all notification flags are null → should default to true
        // (push/sms/email) and false (whatsapp) as per the merge-with-defaults logic.
        var user = await SeedUserWithoutPreference(lang: "ta");
        var handler = CommandHandler(user.Id);

        var result = await handler.Handle(
            new UpdatePreferencesCommand(null, "LIGHT", null, null, null, null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var saved = await _db.UserPreferences.FirstOrDefaultAsync(p => p.UserId == user.Id);
        saved.Should().NotBeNull("row must be created even when most fields are null");
        saved!.Theme.Should().Be("LIGHT");
        saved.PreferredLanguage.Should().Be("ta", "null language falls back to user.PreferredLanguage");
        saved.PushNotificationsEnabled.Should().BeTrue("default for new row with null push flag");
        saved.SmsNotificationsEnabled.Should().BeTrue();
        saved.EmailNotificationsEnabled.Should().BeTrue();
        saved.WhatsappNotificationsEnabled.Should().BeFalse("default for new row with null whatsapp flag");
    }

    [Fact]
    public async Task PatchPreferences_NoExistingRow_UserAggregateLanguageAlsoUpdated()
    {
        var user = await SeedUserWithoutPreference(lang: "en");
        var handler = CommandHandler(user.Id);

        await handler.Handle(
            new UpdatePreferencesCommand("kn", "SYSTEM", null, null, null, null),
            CancellationToken.None);

        // Both the preference row AND the user aggregate must reflect the new language.
        var savedUser = await _db.Users.FindAsync(user.Id);
        savedUser!.PreferredLanguage.Should().Be("kn");
        var savedPref = await _db.UserPreferences.FirstOrDefaultAsync(p => p.UserId == user.Id);
        savedPref!.PreferredLanguage.Should().Be("kn");
    }

    // ══════════════════════════════════════════════════════════════════
    // Validator tests
    // ══════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("LIGHT")]
    [InlineData("DARK")]
    [InlineData("SYSTEM")]
    public void Validator_ValidTheme_Passes(string theme)
    {
        var v = new UpdatePreferencesCommandValidator();
        var result = v.Validate(new UpdatePreferencesCommand(null, theme, null, null, null, null));
        result.IsValid.Should().BeTrue($"'{theme}' is a valid theme");
    }

    [Theory]
    [InlineData("light")]       // wrong case
    [InlineData("Dark")]
    [InlineData("MIDNIGHT")]    // not a valid value
    [InlineData("")]
    public void Validator_InvalidTheme_Fails(string theme)
    {
        var v = new UpdatePreferencesCommandValidator();
        var result = v.Validate(new UpdatePreferencesCommand(null, theme, null, null, null, null));
        result.IsValid.Should().BeFalse($"'{theme}' is not a valid theme");
    }

    [Fact]
    public void Validator_NullTheme_Passes()
    {
        var v = new UpdatePreferencesCommandValidator();
        var result = v.Validate(new UpdatePreferencesCommand(null, null, null, null, null, null));
        result.IsValid.Should().BeTrue("null theme means 'keep existing' and should not be validated");
    }

    [Fact]
    public void Validator_EmptyLanguage_Fails()
    {
        var v = new UpdatePreferencesCommandValidator();
        var result = v.Validate(new UpdatePreferencesCommand("", null, null, null, null, null));
        result.IsValid.Should().BeFalse("empty string language should fail validation");
    }

    [Fact]
    public void Validator_TooLongLanguage_Fails()
    {
        var v = new UpdatePreferencesCommandValidator();
        var result = v.Validate(new UpdatePreferencesCommand(new string('x', 21), null, null, null, null, null));
        result.IsValid.Should().BeFalse("language tag longer than 20 chars should fail");
    }

    [Fact]
    public void Validator_ValidLanguage_Passes()
    {
        var v = new UpdatePreferencesCommandValidator();
        var result = v.Validate(new UpdatePreferencesCommand("hi", null, null, null, null, null));
        result.IsValid.Should().BeTrue("'hi' is a valid BCP-47 language tag");
    }
}
