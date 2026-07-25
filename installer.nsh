!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

Var ShortcutCheckboxHwnd
Var CreateDesktopShortcut
Var DescLabelHwnd

; -----------------------------
; 自定义页面：安装选项
; -----------------------------
Function CreateShortcutPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "安装选项" "配置快捷方式与其他偏好设置"

  ; 主说明文字
  ${NSD_CreateLabel} 0 8u 100% 20u "请根据您的使用习惯选择以下选项："
  Pop $DescLabelHwnd
  SetCtlColors $DescLabelHwnd 0x444444 transparent

  ; 分组框：快捷方式
  ${NSD_CreateGroupBox} 0 34u 100% 56u "快捷方式"
  Pop $0

  ; 桌面快捷方式复选框
  ${NSD_CreateCheckbox} 12u 50u 90% 12u "创建桌面快捷方式 (&D)"
  Pop $ShortcutCheckboxHwnd
  ${NSD_Check} $ShortcutCheckboxHwnd

  ; 次级说明
  ${NSD_CreateLabel} 12u 66u 90% 20u "在桌面上生成 MemoPaste 快捷方式，方便快速启动应用程序。"
  Pop $0
  SetCtlColors $0 0x777777 transparent

  nsDialogs::Show
FunctionEnd

Function CreateShortcutPageLeave
  ${NSD_GetState} $ShortcutCheckboxHwnd $CreateDesktopShortcut
FunctionEnd

PageEx custom
  PageCallbacks CreateShortcutPage CreateShortcutPageLeave
PageExEnd

; -----------------------------
; 安装完成后创建桌面快捷方式
; -----------------------------
!macro customInstall
  ${If} $CreateDesktopShortcut == ${BST_CHECKED}
    ; 工作目录由 SetOutPath 决定；勿把路径塞进 CreateShortCut 的 description 参数
    SetOutPath "$INSTDIR"
    CreateShortCut "$DESKTOP\${APP_FILENAME}.lnk" "$INSTDIR\${APP_FILENAME}.exe"
    System::Call 'shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${EndIf}
!macroend

; -----------------------------
; 卸载时清理桌面快捷方式与 updater 缓存
; -----------------------------
!macro customUnInstall
  IfFileExists "$DESKTOP\${APP_FILENAME}.lnk" 0 +2
    Delete "$DESKTOP\${APP_FILENAME}.lnk"

  ; electron-updater 下载缓存（%LOCALAPPDATA%\<name>-updater）
  RMDir /r "$LOCALAPPDATA\${APP_FILENAME}-updater"
!macroend
