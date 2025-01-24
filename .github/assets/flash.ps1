if (Test-Path ./openocd/bin/openocd.exe) {
  Write-Host "Previous download of OpenOCD is found. Skipping download..."
} else {
  Write-Host "Installing 7z..."

  winget install -e --id 7zip.7zip

  Write-Host "Downloading OpenOCD for Windows..."

  $url = "https://sysprogs.com/files/auxiliary/openocd/com.sysprogs.arm.openocd/openocd-20240916.7z"
  $target = "openocd.7z"
  $zip = "C:\Program Files\7-Zip\7z.exe"

  try {
    Invoke-WebRequest -Uri $URL -OutFile $target -ErrorAction Stop
  } catch {
    Write-Host "Failed to download ${target}: $_"
    exit 1
  }

  Write-Host "Extracting OpenOCD for Windows..."

  try {
    & $zip x $target -y
  } catch {
    Write-Host "Failed to extract ${target}: $_"
    exit 1
  }

  $dir = Get-ChildItem -Path $SearchPath -Directory -Filter "OpenOCD-*" | Select-Object -First 1
  Rename-Item -Path $dir -NewName openocd  
  Remove-Item -Path $target -Force
}

Write-Host "Flashing firmware to the device..."
./openocd/bin/openocd.exe -f ./fsk-energymeter.cfg
