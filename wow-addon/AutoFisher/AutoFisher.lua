-- AutoFisher: one-key fishing.
--
-- While fishing mode is on, your fishing key casts Fishing. While the line is
-- out, the same key becomes "Interact" so pressing it on the splash reels in
-- the bobber (clients with soft targeting: Retail and current Classic). Auto
-- loot is turned on and the sound mix is changed so the splash is easy to hear.
-- Every CVar the addon changes is put back when fishing mode is turned off,
-- on logout, or on the next login if the game closed unexpectedly.
--
-- Blizzard only lets an addon cast a spell or click the bobber when you press
-- a key or click, so every cast and every catch is one key press from you.
-- The addon never casts or loots on its own.

local ADDON = "AutoFisher"
local BUTTON_NAME = "AutoFisherCastButton"

local DEFAULTS = {
    key = "F",
    sound = true,
    autoloot = true,
    total = 0,
    items = {},
    savedCVars = {},
}

local db
local active = false
local fishing = false        -- line is in the water
local pendingBinding = nil   -- binding change waiting for combat to end
local sessionCatches = 0
local fishingName = "Fishing"

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------

local function Print(msg)
    DEFAULT_CHAT_FRAME:AddMessage("|cff33ccffAutoFisher|r: " .. tostring(msg))
end

-- CVar access that works on every client and never throws on a CVar the
-- client does not have.
local function GetCV(name)
    local ok, value
    if C_CVar and C_CVar.GetCVar then
        ok, value = pcall(C_CVar.GetCVar, name)
    else
        ok, value = pcall(GetCVar, name)
    end
    if ok then return value end
    return nil
end

local function SetCV(name, value)
    local ok
    if C_CVar and C_CVar.SetCVar then
        ok = pcall(C_CVar.SetCVar, name, tostring(value))
    else
        ok = pcall(SetCVar, name, tostring(value))
    end
    return ok
end

local function SpellName(id)
    if C_Spell and C_Spell.GetSpellName then
        local ok, name = pcall(C_Spell.GetSpellName, id)
        if ok and name then return name end
    end
    if GetSpellInfo then
        local ok, name = pcall(GetSpellInfo, id)
        if ok and name then return name end
    end
    return nil
end

-- 131474 = Fishing on Retail, 7620 = Fishing (Apprentice) on Classic clients.
-- Casting by name picks the highest rank you know on Classic.
local function FindFishingName()
    return SpellName(131474) or SpellName(7620) or "Fishing"
end

-- Soft targeting lets the Interact key pick up the bobber.
local function HasSoftInteract()
    return GetCV("SoftTargetInteract") ~= nil
end

---------------------------------------------------------------------------
-- Secure cast button (a key press "clicks" it, which casts Fishing)
---------------------------------------------------------------------------

local owner = CreateFrame("Frame", "AutoFisherFrame", UIParent)

local castButton = CreateFrame("Button", BUTTON_NAME, UIParent, "SecureActionButtonTemplate")
castButton:SetWidth(1)
castButton:SetHeight(1)
castButton:SetPoint("TOPLEFT", UIParent, "TOPLEFT", -10, 10) -- just off screen
castButton:EnableMouse(false)
castButton:Show()
-- Newer clients only run a binding click on the half (down or up) that
-- matches the "cast on key down" option, so the button must listen to both.
-- Older clients run every click they get, so they listen to key up only, or
-- one press would cast twice.
if C_CVar and GetCV("ActionButtonUseKeyDown") ~= nil then
    castButton:RegisterForClicks("AnyUp", "AnyDown")
else
    castButton:RegisterForClicks("AnyUp")
end
castButton:SetAttribute("type", "spell")
castButton:SetAttribute("spell", fishingName)

---------------------------------------------------------------------------
-- Key binding
---------------------------------------------------------------------------

-- state: "cast", "reel" or "none"
local function ApplyBinding(state)
    if InCombatLockdown() then
        pendingBinding = state
        owner:RegisterEvent("PLAYER_REGEN_ENABLED")
        return
    end
    pendingBinding = nil
    ClearOverrideBindings(owner)
    if state == "none" or not db.key or db.key == "" then return end
    if state == "reel" then
        SetOverrideBinding(owner, true, db.key, "INTERACTTARGET")
    else
        SetOverrideBindingClick(owner, true, db.key, BUTTON_NAME, "LeftButton")
    end
end

---------------------------------------------------------------------------
-- CVars changed while fishing
---------------------------------------------------------------------------

local function WantedCVars()
    local wanted = {}
    if db.sound then
        wanted.Sound_EnableAllSound = "1"
        wanted.Sound_EnableSFX = "1"
        wanted.Sound_SFXVolume = "1"
        wanted.Sound_MusicVolume = "0"
        wanted.Sound_AmbienceVolume = "0"
        wanted.Sound_DialogVolume = "0"
    end
    if db.autoloot then
        wanted.autoLootDefault = "1"
    end
    if HasSoftInteract() then
        wanted.SoftTargetInteract = "3"         -- soft target with mouse and keyboard
        wanted.SoftTargetInteractRange = "30"   -- reach the bobber
        wanted.SoftTargetInteractArc = "2"
        wanted.SoftTargetIconGameObject = "1"   -- icon over the bobber
        wanted.SoftTargetIconInteract = "1"
    end
    return wanted
end

local function ApplyCVars()
    for name, value in pairs(WantedCVars()) do
        local current = GetCV(name)
        if current ~= nil then
            -- Remember the player's own value once, so it can be put back.
            if db.savedCVars[name] == nil then
                db.savedCVars[name] = current
            end
            SetCV(name, value)
        end
    end
end

local function RestoreCVars()
    for name, value in pairs(db.savedCVars) do
        SetCV(name, value)
    end
    db.savedCVars = {}
end

---------------------------------------------------------------------------
-- On-screen indicator
---------------------------------------------------------------------------

local indicator = CreateFrame("Frame", "AutoFisherIndicator", UIParent)
indicator:SetWidth(260)
indicator:SetHeight(20)
indicator:SetPoint("TOP", UIParent, "TOP", 0, -120)
indicator:Hide()
local indicatorText = indicator:CreateFontString(nil, "OVERLAY", "GameFontNormal")
indicatorText:SetPoint("CENTER")

local function UpdateIndicator()
    if not active then
        indicator:Hide()
        return
    end
    local key = db.key or "?"
    if fishing then
        if HasSoftInteract() then
            indicatorText:SetText("Fishing: press " .. key .. " on the splash")
        else
            indicatorText:SetText("Fishing: right-click the bobber on the splash")
        end
    else
        indicatorText:SetText("Fishing mode: press " .. key .. " to cast")
    end
    indicator:Show()
end

---------------------------------------------------------------------------
-- Turning fishing mode on and off
---------------------------------------------------------------------------

local function Enable()
    if active then return end
    if InCombatLockdown() then
        Print("Can't start fishing mode in combat.")
        return
    end
    if not db.key or db.key == "" then
        Print("No key set. Use /af key F (or any key).")
        return
    end
    fishingName = FindFishingName()
    castButton:SetAttribute("spell", fishingName)
    active = true
    fishing = false
    ApplyCVars()
    ApplyBinding("cast")
    UpdateIndicator()
    if HasSoftInteract() then
        Print("On. Press " .. db.key .. " to cast, then " .. db.key .. " again when the bobber splashes. /af to stop.")
    else
        Print("On. Press " .. db.key .. " to cast, right-click the bobber when it splashes. /af to stop.")
    end
end

local function Disable(quiet)
    if not active then
        RestoreCVars()
        return
    end
    active = false
    fishing = false
    ApplyBinding("none")
    RestoreCVars()
    UpdateIndicator()
    if not quiet then
        Print("Off. Settings restored. Caught " .. sessionCatches .. " this session.")
    end
end

---------------------------------------------------------------------------
-- Events
---------------------------------------------------------------------------

local function IsFishingChannel()
    local ok, name = pcall(UnitChannelInfo, "player")
    if not ok or not name then return false end
    local okCompare, same = pcall(function() return name == fishingName end)
    return okCompare and same
end

local function CountCatch()
    sessionCatches = sessionCatches + 1
    db.total = (db.total or 0) + 1
    for slot = 1, GetNumLootItems() do
        local _, name, quantity = GetLootSlotInfo(slot)
        if name and name ~= "" then
            db.items[name] = (db.items[name] or 0) + (tonumber(quantity) or 1)
        end
    end
end

owner:SetScript("OnEvent", function(self, event, arg1)
    if event == "ADDON_LOADED" then
        if arg1 ~= ADDON then return end
        AutoFisherDB = AutoFisherDB or {}
        db = AutoFisherDB
        for k, v in pairs(DEFAULTS) do
            if db[k] == nil then
                if type(v) == "table" then db[k] = {} else db[k] = v end
            end
        end
        self:UnregisterEvent("ADDON_LOADED")

    elseif event == "PLAYER_LOGIN" then
        -- If the game closed while fishing mode was on, put settings back.
        if next(db.savedCVars) then
            RestoreCVars()
        end
        fishingName = FindFishingName()
        castButton:SetAttribute("spell", fishingName)

    elseif event == "PLAYER_LOGOUT" then
        Disable(true)

    elseif event == "UNIT_SPELLCAST_CHANNEL_START" then
        if arg1 ~= "player" or not active then return end
        if IsFishingChannel() then
            fishing = true
            if HasSoftInteract() then ApplyBinding("reel") end
            UpdateIndicator()
        end

    elseif event == "UNIT_SPELLCAST_CHANNEL_STOP" then
        if arg1 ~= "player" or not active or not fishing then return end
        fishing = false
        ApplyBinding("cast")
        UpdateIndicator()

    elseif event == "LOOT_OPENED" then
        if IsFishingLoot and IsFishingLoot() then
            CountCatch()
        end

    elseif event == "PLAYER_REGEN_ENABLED" then
        self:UnregisterEvent("PLAYER_REGEN_ENABLED")
        if pendingBinding then
            ApplyBinding(pendingBinding)
        end
    end
end)

owner:RegisterEvent("ADDON_LOADED")
owner:RegisterEvent("PLAYER_LOGIN")
owner:RegisterEvent("PLAYER_LOGOUT")
owner:RegisterEvent("UNIT_SPELLCAST_CHANNEL_START")
owner:RegisterEvent("UNIT_SPELLCAST_CHANNEL_STOP")
owner:RegisterEvent("LOOT_OPENED")

---------------------------------------------------------------------------
-- Slash commands
---------------------------------------------------------------------------

local function OnOff(word, current)
    if word == "on" then return true end
    if word == "off" then return false end
    return not current
end

local function ShowStats()
    Print("This session: " .. sessionCatches .. "   All time: " .. (db.total or 0))
    local list = {}
    for name, count in pairs(db.items) do
        list[#list + 1] = { name = name, count = count }
    end
    table.sort(list, function(a, b) return a.count > b.count end)
    for i = 1, math.min(10, #list) do
        Print("  " .. list[i].count .. "x " .. list[i].name)
    end
end

local function Help()
    Print("Commands:")
    Print("  /af  - turn fishing mode on/off")
    Print("  /af key <KEY>  - set the fishing key (now: " .. (db.key or "none") .. "), e.g. /af key F")
    Print("  /af sound on|off  - loud splash while fishing (now: " .. (db.sound and "on" or "off") .. ")")
    Print("  /af loot on|off  - auto loot while fishing (now: " .. (db.autoloot and "on" or "off") .. ")")
    Print("  /af stats  - what you've caught    /af reset  - clear stats")
end

SLASH_AUTOFISHER1 = "/af"
SLASH_AUTOFISHER2 = "/autofish"
SLASH_AUTOFISHER3 = "/autofisher"
SlashCmdList["AUTOFISHER"] = function(msg)
    msg = (msg or ""):gsub("^%s+", ""):gsub("%s+$", "")
    local cmd, rest = msg:match("^(%S*)%s*(.*)$")
    cmd = (cmd or ""):lower()
    rest = rest or ""

    if cmd == "" or cmd == "toggle" then
        if active then Disable() else Enable() end
    elseif cmd == "on" or cmd == "start" then
        Enable()
    elseif cmd == "off" or cmd == "stop" then
        Disable()
    elseif cmd == "key" then
        if rest == "" then
            Print("Fishing key: " .. (db.key or "none") .. ". Change it with /af key <KEY>, e.g. /af key F or /af key SHIFT-F")
            return
        end
        if InCombatLockdown() then
            Print("Can't change the key in combat.")
            return
        end
        db.key = rest:upper()
        Print("Fishing key set to " .. db.key .. ".")
        if active then
            ApplyBinding(fishing and HasSoftInteract() and "reel" or "cast")
            UpdateIndicator()
        end
    elseif cmd == "sound" then
        db.sound = OnOff(rest:lower(), db.sound)
        Print("Loud splash: " .. (db.sound and "on" or "off") .. (active and " (applies next time you start fishing mode)" or ""))
    elseif cmd == "loot" or cmd == "autoloot" then
        db.autoloot = OnOff(rest:lower(), db.autoloot)
        Print("Auto loot: " .. (db.autoloot and "on" or "off") .. (active and " (applies next time you start fishing mode)" or ""))
    elseif cmd == "stats" then
        ShowStats()
    elseif cmd == "reset" then
        db.total = 0
        db.items = {}
        sessionCatches = 0
        Print("Stats cleared.")
    else
        Help()
    end
end
