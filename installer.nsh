!include "LogicLib.nsh"
!include "WinMessages.nsh"

; -----------------------------
; 安装阶段：强制要求目标安装目录为空（允许覆盖已注册的旧 MemoPaste 安装目录）
; -----------------------------
!ifndef BUILD_UNINSTALLER
  !ifdef allowToChangeInstallationDirectory
    !macro customHeader
      Var OrigDirText
      Var DirWarningShown

      ; 计算与 assistedInstaller.nsh instFilesPre 一致的最终安装目录
      Function ResolveEffectiveInstallDir
        Exch $R0
        Push $R1
        Push $R2

        ${StrContains} $R1 "${APP_FILENAME}" $R0
        ${If} $R1 == ""
          StrCpy $R2 $R0 1 -1
          ${If} $R2 == "\"
            StrCpy $R0 "$R0${APP_FILENAME}"
          ${Else}
            StrCpy $R0 "$R0\${APP_FILENAME}"
          ${EndIf}
        ${EndIf}

        Pop $R2
        Pop $R1
        Exch $R0
      FunctionEnd

      ; 检查目标目录是否安全（输出：1=空目录/不存在/已有 MemoPaste 安装目录，0=非空且非本应用目录）
      Function IsInstallDirSafe
        Exch $R0
        Push $R1
        Push $R2
        Push $R3

        ; 1. 检查目录是否存在且非空
        StrCpy $R1 "1"
        ClearErrors
        FindFirst $R2 $R3 "$R0\*.*"
        IfErrors _dir_check_done
        _dir_check_loop:
          StrCmp $R3 "" _dir_check_close
          StrCmp $R3 "." _dir_check_next
          StrCmp $R3 ".." _dir_check_next
          StrCpy $R1 "0"
          Goto _dir_check_close
        _dir_check_next:
          FindNext $R2 $R3
          Goto _dir_check_loop
        _dir_check_close:
          FindClose $R2
        _dir_check_done:

        ; 2. 路径指向已存在的普通文件（非目录）时也禁止
        ${If} $R1 == "1"
        ${AndIf} ${FileExists} "$R0"
        ${AndIfNot} ${FileExists} "$R0\*.*"
          StrCpy $R1 "0"
        ${EndIf}

        ; 3. 若目录非空，仅当它是当前安装模式已注册的旧安装目录且存在卸载程序时允许覆盖安装
        ${If} $R1 == "0"
          ${If} $installMode == "all"
            !ifdef INSTALL_MODE_PER_ALL_USERS_REQUIRED
              ${If} $perMachineInstallationFolder != ""
              ${AndIf} $R0 == $perMachineInstallationFolder
              ${AndIf} ${FileExists} "$R0\${UNINSTALL_FILENAME}"
                StrCpy $R1 "1"
              ${EndIf}
            !endif
          ${Else}
            !ifndef INSTALL_MODE_PER_ALL_USERS
              ${If} $perUserInstallationFolder != ""
              ${AndIf} $R0 == $perUserInstallationFolder
              ${AndIf} ${FileExists} "$R0\${UNINSTALL_FILENAME}"
                StrCpy $R1 "1"
              ${EndIf}
            !endif
          ${EndIf}
        ${EndIf}

        StrCpy $R0 $R1
        Pop $R3
        Pop $R2
        Pop $R1
        Exch $R0
      FunctionEnd

      ; NSIS 原生目录校验回调：目录不安全时实时禁用「安装」按钮并在页顶提示原因
      Function .onVerifyInstDir
        Push $R0
        Push $R1
        Push $R3
        Push $R4
        Push $R5

        Push $INSTDIR
        Call ResolveEffectiveInstallDir
        Call IsInstallDirSafe
        Pop $R1

        ${If} $R1 != "1"
          FindWindow $R4 "#32770" "" $HWNDPARENT
          ${If} $R4 != 0
            GetDlgItem $R5 $R4 1006
            ${If} $R5 != 0
              ${If} $OrigDirText == ""
                System::Call 'user32::GetWindowText(p R5, t .R3, i ${NSIS_MAX_STRLEN})'
                StrCpy $OrigDirText $R3
              ${EndIf}
              ${If} $LANGUAGE == ${LANG_SIMPCHINESE}
                StrCpy $R3 "所选安装目录不为空！为避免卸载时误删您的其他文件，请选择空目录或新建子目录。"
              ${ElseIf} $LANGUAGE == ${LANG_TRADCHINESE}
                StrCpy $R3 "所選安裝目錄不為空！為避免解除安裝時誤刪您的其他檔案，請選擇空目錄或新建子目錄。"
              ${Else}
                StrCpy $R3 "The selected folder is not empty! To prevent accidental file loss on uninstall, please choose an empty folder or a new subfolder."
              ${EndIf}
              SendMessage $R5 ${WM_SETTEXT} 0 "STR:$R3"
              StrCpy $DirWarningShown "1"
            ${EndIf}
          ${EndIf}

          Pop $R5
          Pop $R4
          Pop $R3
          Pop $R1
          Pop $R0
          Abort
        ${Else}
          ${If} $DirWarningShown == "1"
            FindWindow $R4 "#32770" "" $HWNDPARENT
            ${If} $R4 != 0
              GetDlgItem $R5 $R4 1006
              ${If} $R5 != 0
              ${AndIf} $OrigDirText != ""
                SendMessage $R5 ${WM_SETTEXT} 0 "STR:$OrigDirText"
              ${EndIf}
            ${EndIf}
            StrCpy $DirWarningShown "0"
          ${EndIf}
        ${EndIf}

        Pop $R5
        Pop $R4
        Pop $R3
        Pop $R1
        Pop $R0
      FunctionEnd
    !macroend

    ; 静默安装（/S /D=...）同样校验目标目录非空安全，避免绕过目录页校验
    !macro customInit
      ${If} ${Silent}
      ${AndIfNot} ${isUpdated}
        Push $INSTDIR
        Call IsInstallDirSafe
        Pop $R1
        ${If} $R1 != "1"
          SetErrorLevel 2
          Quit
        ${EndIf}
      ${EndIf}
    !macroend
  !endif
!endif

; -----------------------------
; 卸载时补充清理官方卸载器不处理的残余项
; -----------------------------
!macro customUnInstall
  ; 覆盖安装 / 升级时官方会传入 --updated，跳过清理以保留用户自启偏好与本地数据
  ${IfNot} ${isUpdated}
    ; 1. 清理 Electron app.setLoginItemSettings() 写入的开机自启注册表项
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.${PRODUCT_NAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.${APP_FILENAME}"

    ; 2. 清理 Windows 任务管理器「启动应用」中可能残留的禁用状态记录
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "electron.app.${PRODUCT_NAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "electron.app.${APP_FILENAME}"

    ; 以下均位于当前用户目录；per-machine 模式下需先切回 current 上下文
    ${If} $installMode == "all"
      SetShellVarContext current
    ${EndIf}

    ; 3. 清理 electron-builder 安装阶段复制的本地缓存目录（%LOCALAPPDATA%\<name>-updater）
    RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}-updater"

    ; 4. 交互式卸载且未传入 --delete-app-data 时，按需询问是否删除本地用户数据（默认「否」）
    ${IfNot} ${Silent}
    ${AndIf} $isDeleteAppData != "1"
      StrCpy $R9 "0"
      ${If} ${FileExists} "$APPDATA\${APP_FILENAME}\*.*"
        StrCpy $R9 "1"
      ${EndIf}
      !ifdef APP_PRODUCT_FILENAME
        ${If} ${FileExists} "$APPDATA\${APP_PRODUCT_FILENAME}\*.*"
          StrCpy $R9 "1"
        ${EndIf}
      !endif
      !ifdef APP_PACKAGE_NAME
        ${If} ${FileExists} "$APPDATA\${APP_PACKAGE_NAME}\*.*"
          StrCpy $R9 "1"
        ${EndIf}
      !endif

      ${If} $R9 == "1"
        ${If} $LANGUAGE == ${LANG_SIMPCHINESE}
          StrCpy $R8 "是否同时删除 ${PRODUCT_NAME} 的本地数据（收藏记录、剪贴板历史与配置）？$\r$\n$\r$\n选择「否」将保留数据，以便日后重新安装时恢复。"
        ${ElseIf} $LANGUAGE == ${LANG_TRADCHINESE}
          StrCpy $R8 "是否同時刪除 ${PRODUCT_NAME} 的本機資料（收藏記錄、剪貼簿歷史與設定）？$\r$\n$\r$\n選擇「否」將保留資料，以便日後重新安裝時還原。"
        ${Else}
          StrCpy $R8 "Do you also want to delete ${PRODUCT_NAME} local data (favorites, clipboard history, and settings)?$\r$\n$\r$\nSelect No to keep your data for future reinstalls."
        ${EndIf}

        !define _SKIP_APPDATA_DELETE "skip_delete_app_data_${__LINE__}"
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$R8" /SD IDNO IDNO ${_SKIP_APPDATA_DELETE}
          RMDir /r "$APPDATA\${APP_FILENAME}"
          !ifdef APP_PRODUCT_FILENAME
            RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
          !endif
          !ifdef APP_PACKAGE_NAME
            RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
          !endif
        ${_SKIP_APPDATA_DELETE}:
        !undef _SKIP_APPDATA_DELETE
      ${EndIf}
    ${EndIf}

    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  ${EndIf}
!macroend
