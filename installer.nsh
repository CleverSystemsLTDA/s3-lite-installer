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
  DetailPrint "Creating scheduled task s3lite-launcher..."

  ; Liga o historico do Agendador: quando a tarefa for pulada, fica registro para diagnostico
  nsExec::ExecToLog 'wevtutil sl Microsoft-Windows-TaskScheduler/Operational /e:true'

  ; Registro por XML (public\s3lite-launcher.xml, UTF-16): gatilho no logon de qualquer usuario,
  ; grupo Usuarios com HighestAvailable, sem limite de 72 h, roda na bateria, pasta C:\s3lite.
  ; /f sobrescreve a tarefa antiga (ONSTART) sem precisar apagar antes.
  Push $0
  nsExec::ExecToLog 'schtasks /create /tn "s3lite-launcher" /xml "$INSTDIR\s3lite-launcher.xml" /f'
  Pop $0
  ${if} $0 == 0
    DetailPrint "Scheduled task created from XML (logon trigger)"
  ${else}
    ; Sem o XML a maquina ficaria sem auto start: cai para a linha de comando, no logon
    DetailPrint "XML import failed ($0), creating scheduled task by command line (ONLOGON)"
    nsExec::ExecToLog 'schtasks /create /tn "s3lite-launcher" /tr "C:\s3lite\s3lite.exe" /sc ONLOGON /rl HIGHEST /delay 0000:15 /f'
    Pop $0
    ${if} $0 != 0
      DetailPrint "ONLOGON failed ($0), creating scheduled task ONSTART (old way)"
      nsExec::ExecToLog 'schtasks /create /tn "s3lite-launcher" /tr "C:\s3lite\s3lite.exe" /sc ONSTART /rl HIGHEST /delay 0000:30 /f'
      Pop $0
    ${endIf}
  ${endIf}
  Pop $0
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