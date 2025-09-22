!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\s3lite"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\s3lite"
  SetRegView 32
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\s3lite"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\s3lite"
!macroend

!macro customRemoveFiles
${if} ${isUpdated}
  !insertmacro quitSuccess
${else}
  RMDir /r $INSTDIR
${endIf}
!macroend

; Custom macro to add firewall rules during installation
!macro customInstall
  DetailPrint "Adding firewall rules for s3lite..."
  
  ; Remove any existing firewall rules first (ignore errors)
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="s3lite"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="s3lite-app"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="application.exe"'
  
  ; Add firewall rules for the main launcher executable
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite" dir=in action=allow program="C:\s3lite\s3lite.exe" enable=yes'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite" dir=out action=allow program="C:\s3lite\s3lite.exe" enable=yes'
  
  ; Add firewall rules for application.exe (adjust path based on where your app puts it)
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite-app" dir=in action=allow program="C:\s3lite\application.exe" enable=yes'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite-app" dir=out action=allow program="C:\s3lite\application.exe" enable=yes'
  
  DetailPrint "Firewall rules added successfully"
!macroend

; Custom section to handle firewall rules for both install and update
Section "Firewall Rules" SEC_FIREWALL
  DetailPrint "Setting up firewall rules for s3lite..."
  
  ; Remove any existing firewall rules first (ignore errors)
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="s3lite"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="s3lite-app"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="application.exe"'
  
  ; Add firewall rules for the main launcher executable
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite" dir=in action=allow program="C:\s3lite\s3lite.exe" enable=yes'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite" dir=out action=allow program="C:\s3lite\s3lite.exe" enable=yes'
  
  ; Add firewall rules for application.exe
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite-app" dir=in action=allow program="C:\s3lite\application.exe" enable=yes'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite-app" dir=out action=allow program="C:\s3lite\application.exe" enable=yes'
  
  DetailPrint "Firewall rules configured successfully"
SectionEnd

; Custom uninstaller section to clean up firewall rules
!macro customUnInstall
  DetailPrint "Removing firewall rules for s3lite..."
  
  ; Remove all firewall rules associated with s3lite
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="s3lite"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="s3lite-app"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="application.exe"'
  
  DetailPrint "Firewall rules removed"
!macroend