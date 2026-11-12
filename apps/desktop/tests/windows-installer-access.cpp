#define WIN32_LEAN_AND_MEAN
#define UNICODE
#include <windows.h>
#include <aclapi.h>
#include <string>
#include <vector>
#include <cstring>

extern "C" __declspec(dllimport) DWORD __cdecl InstallerGrantAppPackageRead(LPCWSTR directory);

static std::vector<std::vector<BYTE>> Rules(const std::wstring& path) {
    PACL acl = nullptr;
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    if (GetNamedSecurityInfoW(path.c_str(), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
        nullptr, nullptr, &acl, nullptr, &descriptor) != ERROR_SUCCESS || !acl) return {};
    std::vector<std::vector<BYTE>> rules;
    for (DWORD i = 0; i < acl->AceCount; ++i) {
        void* ace = nullptr;
        if (!GetAce(acl, i, &ace)) break;
        const auto* header = static_cast<ACE_HEADER*>(ace);
        rules.emplace_back(static_cast<BYTE*>(ace), static_cast<BYTE*>(ace) + header->AceSize);
    }
    LocalFree(descriptor);
    return rules;
}

static bool HasReadExecute(const std::wstring& path) {
    BYTE sid[SECURITY_MAX_SID_SIZE]; DWORD size = sizeof(sid);
    if (!CreateWellKnownSid(WinBuiltinAnyPackageSid, nullptr, sid, &size)) return false;
    for (const auto& bytes : Rules(path)) {
        const auto* ace = reinterpret_cast<const ACCESS_ALLOWED_ACE*>(bytes.data());
        if (ace->Header.AceType == ACCESS_ALLOWED_ACE_TYPE &&
            EqualSid(const_cast<DWORD*>(&ace->SidStart), sid) &&
            ace->Mask == (FILE_GENERIC_READ | FILE_GENERIC_EXECUTE)) return true;
    }
    return false;
}

int wmain(int argc, wchar_t** argv) {
    if (argc != 2) return 1;
    const std::wstring root = argv[1], child = root + L"\\child", file = child + L"\\asset.txt";
    if (InstallerGrantAppPackageRead((root + L"-missing").c_str()) != ERROR_FILE_NOT_FOUND) return 2;
    if (!CreateDirectoryW(root.c_str(), nullptr) || !CreateDirectoryW(child.c_str(), nullptr)) return 3;
    HANDLE handle = CreateFileW(file.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, 0, nullptr);
    if (handle == INVALID_HANDLE_VALUE) return 4;
    CloseHandle(handle);
    if (InstallerGrantAppPackageRead(file.c_str()) != ERROR_INVALID_PARAMETER) return 5;
    const auto before = Rules(root);
    if (before.empty() || InstallerGrantAppPackageRead(root.c_str()) != ERROR_SUCCESS) return 6;
    const auto after = Rules(root);
    for (const auto& original : before) {
        bool retained = false;
        for (const auto& current : after) if (original == current) retained = true;
        if (!retained) return 7;
    }
    if (!HasReadExecute(root) || !HasReadExecute(child) || !HasReadExecute(file)) return 8;
    if (InstallerGrantAppPackageRead(root.c_str()) != ERROR_SUCCESS || Rules(root) != after) return 9;
    if (!DeleteFileW(file.c_str()) || !RemoveDirectoryW(child.c_str()) || !RemoveDirectoryW(root.c_str())) return 10;
    return 0;
}
