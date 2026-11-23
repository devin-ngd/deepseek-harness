#define WIN32_LEAN_AND_MEAN
#define UNICODE
#include <windows.h>
#include <aclapi.h>
#include <string>
#include <vector>

extern "C" __declspec(dllimport) DWORD __cdecl InstallerProtectDirectoryAcl(LPCWSTR directory);

static std::vector<std::vector<BYTE>> Rules(const std::wstring& path) {
    PACL acl = nullptr;
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    if (GetNamedSecurityInfoW(path.c_str(), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
        nullptr, nullptr, &acl, nullptr, &descriptor) != ERROR_SUCCESS || !acl) return {};
    std::vector<std::vector<BYTE>> rules;
    for (DWORD index = 0; index < acl->AceCount; ++index) {
        void* ace = nullptr;
        if (!GetAce(acl, index, &ace)) break;
        const auto* header = static_cast<ACE_HEADER*>(ace);
        rules.emplace_back(static_cast<BYTE*>(ace), static_cast<BYTE*>(ace) + header->AceSize);
    }
    LocalFree(descriptor);
    return rules;
}

static bool HasAceForSid(const std::wstring& path, PSID sid, BYTE type = ACCESS_ALLOWED_ACE_TYPE) {
    for (const auto& bytes : Rules(path)) {
        const auto* ace = reinterpret_cast<const ACCESS_ALLOWED_ACE*>(bytes.data());
        if (ace->Header.AceType == type && EqualSid(const_cast<DWORD*>(&ace->SidStart), sid)) return true;
    }
    return false;
}

static bool HasAccess(const std::wstring& path, PSID sid, ACCESS_MASK rights) {
    for (const auto& bytes : Rules(path)) {
        const auto* ace = reinterpret_cast<const ACCESS_ALLOWED_ACE*>(bytes.data());
        if (ace->Header.AceType == ACCESS_ALLOWED_ACE_TYPE && ace->Mask == rights &&
            EqualSid(const_cast<DWORD*>(&ace->SidStart), sid)) return true;
    }
    return false;
}

static bool HasInheritedAce(const std::wstring& path) {
    for (const auto& bytes : Rules(path)) {
        const auto* header = reinterpret_cast<const ACE_HEADER*>(bytes.data());
        if ((header->AceFlags & INHERITED_ACE) != 0) return true;
    }
    return false;
}

static DWORD MandatoryLabelRid(const std::wstring& path) {
    PACL sacl = nullptr;
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    if (GetNamedSecurityInfoW(path.c_str(), SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION,
        nullptr, nullptr, nullptr, &sacl, &descriptor) != ERROR_SUCCESS) return 0xFFFFFFFF;
    DWORD lowest = SECURITY_MANDATORY_MEDIUM_RID;
    bool found = false;
    if (sacl != nullptr) {
        for (DWORD index = 0; index < sacl->AceCount; ++index) {
            void* ace = nullptr;
            if (!GetAce(sacl, index, &ace)) break;
            const auto* header = static_cast<const ACE_HEADER*>(ace);
            if (header->AceType != SYSTEM_MANDATORY_LABEL_ACE_TYPE) continue;
            const auto* labelAce = static_cast<const SYSTEM_MANDATORY_LABEL_ACE*>(ace);
            PSID labelSid = const_cast<DWORD*>(&labelAce->SidStart);
            if (!IsValidSid(labelSid)) continue;
            const UCHAR count = *GetSidSubAuthorityCount(labelSid);
            if (count == 0) continue;
            const DWORD rid = *GetSidSubAuthority(labelSid, count - 1);
            if (!found || rid < lowest) lowest = rid;
            found = true;
        }
    }
    LocalFree(descriptor);
    return lowest;
}

static DWORD SetLowMandatoryLabel(const std::wstring& path) {
    BYTE lowLabelSid[SECURITY_MAX_SID_SIZE];
    DWORD lowLabelSidSize = sizeof(lowLabelSid);
    std::vector<BYTE> storage(sizeof(ACL) + sizeof(SYSTEM_MANDATORY_LABEL_ACE) + SECURITY_MAX_SID_SIZE);
    PACL sacl = reinterpret_cast<PACL>(storage.data());
    if (!CreateWellKnownSid(WinLowLabelSid, nullptr, lowLabelSid, &lowLabelSidSize) ||
        !InitializeAcl(sacl, static_cast<DWORD>(storage.size()), ACL_REVISION) ||
        !AddMandatoryAce(sacl, ACL_REVISION, SUB_CONTAINERS_AND_OBJECTS_INHERIT,
            SYSTEM_MANDATORY_LABEL_NO_WRITE_UP, lowLabelSid)) return GetLastError();
    return SetNamedSecurityInfoW(const_cast<LPWSTR>(path.c_str()), SE_FILE_OBJECT,
        LABEL_SECURITY_INFORMATION, nullptr, nullptr, nullptr, sacl);
}

int wmain(int argc, wchar_t** argv) {
    if (argc != 2) return 1;
    const std::wstring root = argv[1], child = root + L"\\child", file = child + L"\\asset.txt";
    const DWORD missingResult = InstallerProtectDirectoryAcl((root + L"-missing").c_str());
    if (missingResult != ERROR_FILE_NOT_FOUND && missingResult != ERROR_PATH_NOT_FOUND) return 2;
    if (!CreateDirectoryW(root.c_str(), nullptr)) return 3;

    BYTE packageSid[SECURITY_MAX_SID_SIZE];
    BYTE worldSid[SECURITY_MAX_SID_SIZE];
    BYTE systemSid[SECURITY_MAX_SID_SIZE];
    BYTE administratorsSid[SECURITY_MAX_SID_SIZE];
    BYTE usersSid[SECURITY_MAX_SID_SIZE];
    DWORD packageSidSize = sizeof(packageSid);
    DWORD worldSidSize = sizeof(worldSid);
    DWORD systemSidSize = sizeof(systemSid);
    DWORD administratorsSidSize = sizeof(administratorsSid);
    DWORD usersSidSize = sizeof(usersSid);
    if (!CreateWellKnownSid(WinBuiltinAnyPackageSid, nullptr, packageSid, &packageSidSize) ||
        !CreateWellKnownSid(WinWorldSid, nullptr, worldSid, &worldSidSize) ||
        !CreateWellKnownSid(WinLocalSystemSid, nullptr, systemSid, &systemSidSize) ||
        !CreateWellKnownSid(WinBuiltinAdministratorsSid, nullptr, administratorsSid, &administratorsSidSize) ||
        !CreateWellKnownSid(WinBuiltinUsersSid, nullptr, usersSid, &usersSidSize)) return 4;

    EXPLICIT_ACCESSW pollution[2]{};
    pollution[0].grfAccessPermissions = FILE_GENERIC_READ | FILE_GENERIC_EXECUTE;
    pollution[0].grfAccessMode = GRANT_ACCESS;
    pollution[0].grfInheritance = SUB_CONTAINERS_AND_OBJECTS_INHERIT;
    pollution[0].Trustee.TrusteeForm = TRUSTEE_IS_SID;
    pollution[0].Trustee.TrusteeType = TRUSTEE_IS_WELL_KNOWN_GROUP;
    pollution[0].Trustee.ptstrName = reinterpret_cast<LPWSTR>(packageSid);
    pollution[1].grfAccessPermissions = FILE_DELETE_CHILD;
    pollution[1].grfAccessMode = DENY_ACCESS;
    pollution[1].grfInheritance = SUB_CONTAINERS_AND_OBJECTS_INHERIT;
    pollution[1].Trustee.TrusteeForm = TRUSTEE_IS_SID;
    pollution[1].Trustee.TrusteeType = TRUSTEE_IS_WELL_KNOWN_GROUP;
    pollution[1].Trustee.ptstrName = reinterpret_cast<LPWSTR>(worldSid);

    PACL previous = nullptr;
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    PACL polluted = nullptr;
    DWORD result = GetNamedSecurityInfoW(root.c_str(), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
        nullptr, nullptr, &previous, nullptr, &descriptor);
    if (result == ERROR_SUCCESS) result = SetEntriesInAclW(2, pollution, previous, &polluted);
    if (result == ERROR_SUCCESS)
        result = SetNamedSecurityInfoW(const_cast<LPWSTR>(root.c_str()), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
            nullptr, nullptr, polluted, nullptr);
    LocalFree(polluted);
    LocalFree(descriptor);
    if (result != ERROR_SUCCESS) return 5;
    if (!HasAceForSid(root, reinterpret_cast<SID*>(worldSid), ACCESS_DENIED_ACE_TYPE)) return 6;
    if (SetLowMandatoryLabel(root) != ERROR_SUCCESS) return 16;
    if (MandatoryLabelRid(root) != SECURITY_MANDATORY_LOW_RID) return 17;

    const DWORD missingChildResult = InstallerProtectDirectoryAcl(file.c_str());
    if (missingChildResult != ERROR_FILE_NOT_FOUND && missingChildResult != ERROR_PATH_NOT_FOUND) return 7;
    if (InstallerProtectDirectoryAcl(root.c_str()) != ERROR_SUCCESS) return 8;
    if (!CreateDirectoryW(child.c_str(), nullptr)) return 9;
    HANDLE handle = CreateFileW(file.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, 0, nullptr);
    if (handle == INVALID_HANDLE_VALUE) return 10;
    CloseHandle(handle);

    PSECURITY_DESCRIPTOR ownerDescriptor = nullptr;
    PSID owner = nullptr;
    if (GetNamedSecurityInfoW(root.c_str(), SE_FILE_OBJECT, OWNER_SECURITY_INFORMATION,
        &owner, nullptr, nullptr, nullptr, &ownerDescriptor) != ERROR_SUCCESS || owner == nullptr) return 11;
    const bool programAcl = HasAccess(root, owner, FILE_ALL_ACCESS) &&
        HasAccess(root, reinterpret_cast<SID*>(systemSid), FILE_ALL_ACCESS) &&
        HasAccess(root, reinterpret_cast<SID*>(administratorsSid), FILE_ALL_ACCESS) &&
        HasAccess(root, reinterpret_cast<SID*>(usersSid), FILE_GENERIC_READ | FILE_GENERIC_EXECUTE) &&
        HasAccess(child, owner, FILE_ALL_ACCESS) &&
        HasAccess(file, reinterpret_cast<SID*>(usersSid), FILE_GENERIC_READ | FILE_GENERIC_EXECUTE);
    LocalFree(ownerDescriptor);
    if (!programAcl) return 12;

    for (const std::wstring& entry : {root, child, file}) {
        if (HasAceForSid(entry, reinterpret_cast<SID*>(packageSid)) ||
            HasAceForSid(entry, reinterpret_cast<SID*>(worldSid), ACCESS_DENIED_ACE_TYPE)) return 13;
        if (MandatoryLabelRid(entry) != SECURITY_MANDATORY_MEDIUM_RID) return 18;
    }
    if (HasInheritedAce(root)) return 13;
    if (InstallerProtectDirectoryAcl(root.c_str()) != ERROR_SUCCESS) return 14;
    if (!DeleteFileW(file.c_str()) || !RemoveDirectoryW(child.c_str()) || !RemoveDirectoryW(root.c_str())) return 15;
    return 0;
}
