; Frame custom NSIS additions — included via electron-builder.yml (nsis.include).
;
; v0.30.11 FIX: on some Windows 11 (24H2) setups the stock link creation popped
; "The parameter is incorrect." naming Frame.lnk in the Start Menu:
;   C:\Users\<u>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Frame.lnk
; Two plausible triggers, both eliminated here:
;   1. A stale/corrupt Frame.lnk (locked by OneDrive/AV sync or broken by an old
;      uninstall) makes IShellLink fail on overwrite -> we Delete it first.
;   2. The stock macro passes the package description (was Persian text) as the
;      CreateShortCut description arg (IShellLink::SetDescription path) ->
;      we create the links WITHOUT a description at all.
; We take over BOTH shortcuts: the DO_NOT_CREATE_* guards make the stock
; addStartMenuLink / addDesktopLink macros skip, then customInstall recreates
; them at the EXACT same paths ($SMPROGRAMS\${SHORTCUT_NAME}.lnk and
; $DESKTOP\${SHORTCUT_NAME}.lnk) so the uninstaller's registry-based cleanup
; (MenuDirectory / ShortcutName) keeps working unchanged.

!define DO_NOT_CREATE_START_MENU_SHORTCUT
!define DO_NOT_CREATE_DESKTOP_SHORTCUT

!macro customInstall
  ${ifNot} ${isNoDesktopShortcut}
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0
    ClearErrors
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    ClearErrors
  ${endIf}
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0
  ClearErrors
  WinShell::SetLnkAUMI "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ClearErrors
!macroend
