!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
Var MoonDialog
Var MoonTitle
Var MoonSubtitle
Var MoonPath
Var MoonTitleFont
Var MoonBodyFont
Var MoonSmallFont

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customHeader
  BrandingText "Moon"
!macroend

!macro customWelcomePage
  Page custom MoonWelcomeCreate
!macroend

!macro customPageAfterChangeDir
  Page custom MoonSetupCreate MoonSetupLeave
!macroend

Function MoonStyleNavigation
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:继续"
  GetDlgItem $0 $HWNDPARENT 2
  SendMessage $0 ${WM_SETTEXT} 0 "STR:取消"
  GetDlgItem $0 $HWNDPARENT 3
  SendMessage $0 ${WM_SETTEXT} 0 "STR:返回"
FunctionEnd

Function MoonSetWelcomeHeader
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:Moon"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:安装"
FunctionEnd

Function MoonSetSetupHeader
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:安装设置"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:确认安装位置与隐私选项"
FunctionEnd

Function MoonCreateFonts
  CreateFont $MoonTitleFont "Microsoft YaHei UI" 20 600
  CreateFont $MoonBodyFont "Microsoft YaHei UI" 9 400
  CreateFont $MoonSmallFont "Microsoft YaHei UI" 8 400
FunctionEnd

Function MoonWelcomeCreate
  Call MoonStyleNavigation
  Call MoonCreateFonts
  Call MoonSetWelcomeHeader

  nsDialogs::Create 1018
  Pop $MoonDialog
  ${If} $MoonDialog == error
    Abort
  ${EndIf}

  SetCtlColors $MoonDialog 20211F F7F7F5

  ${NSD_CreateLabel} 12u 30u 280u 32u "安装 Moon"
  Pop $MoonTitle
  SendMessage $MoonTitle ${WM_SETFONT} $MoonTitleFont 0
  SetCtlColors $MoonTitle 20211F F7F7F5

  ${NSD_CreateLabel} 14u 76u 270u 20u "版本 ${VERSION}"
  Pop $MoonSubtitle
  SendMessage $MoonSubtitle ${WM_SETFONT} $MoonBodyFont 0
  SetCtlColors $MoonSubtitle 62665F F7F7F5

  nsDialogs::Show
FunctionEnd

Function MoonBrowseFolder
  nsDialogs::SelectFolderDialog "选择 Moon 的安装位置" "$INSTDIR"
  Pop $0
  ${If} $0 != error
    StrCpy $INSTDIR "$0"
    ${NSD_SetText} $MoonPath "$INSTDIR"
  ${EndIf}
FunctionEnd

Function MoonSetupCreate
  Call MoonStyleNavigation
  Call MoonCreateFonts
  Call MoonSetSetupHeader

  nsDialogs::Create 1018
  Pop $MoonDialog
  ${If} $MoonDialog == error
    Abort
  ${EndIf}

  SetCtlColors $MoonDialog 20211F F7F7F5

  ${NSD_CreateLabel} 12u 6u 280u 28u "安装设置"
  Pop $MoonTitle
  SendMessage $MoonTitle ${WM_SETFONT} $MoonTitleFont 0
  SetCtlColors $MoonTitle 20211F F7F7F5

  ${NSD_CreateLabel} 14u 40u 270u 14u "安装位置"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MoonSmallFont 0
  SetCtlColors $0 62665F F7F7F5

  ${NSD_CreateDirRequest} 14u 57u 218u 22u "$INSTDIR"
  Pop $MoonPath
  SendMessage $MoonPath ${WM_SETFONT} $MoonBodyFont 0

  ${NSD_CreateBrowseButton} 238u 57u 48u 22u "浏览"
  Pop $0
  ${NSD_OnClick} $0 MoonBrowseFolder

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:开始安装"

  nsDialogs::Show
FunctionEnd

Function MoonSetupLeave
  ${NSD_GetText} $MoonPath $INSTDIR
  ${If} $INSTDIR == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "请选择安装位置。"
    Abort
  ${EndIf}
FunctionEnd
!endif
