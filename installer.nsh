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

