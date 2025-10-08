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

!macro customInstall
  DetailPrint "Setting up s3lite with elevated privileges..."
  
  ; ===== REMOVE SHELL STARTUP SHORTCUTS =====
  DetailPrint "Removing shell startup shortcuts..."
  Delete "$SMSTARTUP\s3lite.lnk"
  Delete "$SMSTARTUP\s3lite.exe - Atalho.lnk"
  
  ; ===== FIREWALL RULES =====
  DetailPrint "Configuring firewall rules..."
  
  ; Remove any existing firewall rules first
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="s3lite"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="s3lite-app"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="s3lite-updater"'
  
  ; Add firewall rules for the main launcher executable
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite" dir=in action=allow program="C:\s3lite\s3lite.exe" enable=yes'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite" dir=out action=allow program="C:\s3lite\s3lite.exe" enable=yes'
  
  ; Add firewall rules for application.exe
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite-app" dir=in action=allow program="C:\s3lite\application.exe" enable=yes'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite-app" dir=out action=allow program="C:\s3lite\application.exe" enable=yes'
  
  ; Add firewall rules for the updater (Update.exe in resources folder)
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite-updater" dir=in action=allow program="C:\s3lite\resources\Update.exe" enable=yes'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="s3lite-updater" dir=out action=allow program="C:\s3lite\resources\Update.exe" enable=yes'
  
  DetailPrint "Firewall rules configured successfully"
  
  ; ===== SCHEDULED TASK =====
  DetailPrint "Creating scheduled task for elevated execution..."
  
  ; Delete existing task if it exists (ignore errors)
  nsExec::ExecToLog 'schtasks /delete /tn "s3lite-launcher" /f'
  
  ; Create scheduled task that runs at system startup with highest privileges
  ; /rl HIGHEST = Run with highest privileges (no UAC prompt)
  ; /sc ONSTART = Run when system boots (before user login)
  ; /delay 0000:30 = Wait 30 seconds after boot (gives system time to stabilize)
  nsExec::ExecToLog 'schtasks /create /tn "s3lite-launcher" /tr "C:\s3lite\s3lite.exe" /sc ONSTART /rl HIGHEST /delay 0000:30 /f'
  
  DetailPrint "Scheduled task created successfully"
!macroend

!macro customUnInstall
  DetailPrint "Cleaning up s3lite..."
  
  ; Kill any running instances
  nsExec::ExecToLog 'taskkill /F /IM s3lite.exe'
  nsExec::ExecToLog 'taskkill /F /IM application.exe'
  
  ; Remove scheduled task
  DetailPrint "Removing scheduled task..."
  nsExec::ExecToLog 'schtasks /delete /tn "s3lite-launcher" /f'
  
  ; Remove shell startup shortcuts
  DetailPrint "Removing shell startup shortcuts..."
  Delete "$SMSTARTUP\s3lite.lnk"
  Delete "$SMSTARTUP\s3lite.exe - Atalho.lnk"
  Delete "$SMSTARTUP\s3lite.exe.lnk"
  
  ; Remove firewall rules
  DetailPrint "Removing firewall rules..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="s3lite"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="s3lite-app"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="s3lite-updater"'
  
  DetailPrint "Cleanup completed"
!macroend