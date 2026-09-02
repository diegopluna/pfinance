import { CameraView, useCameraPermissions } from 'expo-camera'
import { router } from 'expo-router'
import { Button } from '@/components/button'
import { useRef, type JSX } from 'react'
import { Linking, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Screen } from '@/components/screen'
import { Body, Title } from '@/components/type'

// The QR path into the connect flow: the web app's settings show the
// Server's API URL as a plain QR code (issue #74 — a raw https URL, no
// custom scheme), so a scan feeds /status exactly like a typed address.
export default function ScanScreen(): JSX.Element {
  const [permission, requestPermission] = useCameraPermissions()
  // CameraView keeps reporting the code while it is in view; only the first
  // hit may navigate.
  const scanned = useRef(false)

  if (permission === null) {
    // Permission state not loaded yet — one frame, at most.
    return <View className="flex-1 bg-background" />
  }

  if (!permission.granted) {
    return (
      <Screen>
        <View className="gap-2.5">
          <Title size="lg">Camera access</Title>
          <Body tone="muted">
            Scanning the QR code needs the camera. The code is in the web app, under Settings →
            Mobile app.
          </Body>
        </View>
        <View className="gap-3">
          {permission.canAskAgain ? (
            <Button onPress={() => void requestPermission()}>Allow camera access</Button>
          ) : (
            <Button onPress={() => void Linking.openSettings()}>Open device settings</Button>
          )}
          <Button variant="ghost" onPress={() => router.back()}>
            Type the address instead
          </Button>
        </View>
      </Screen>
    )
  }

  return (
    <View className="flex-1 bg-background">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (scanned.current) return
          scanned.current = true
          router.replace({ pathname: '/status', params: { input: data } })
        }}
      />
      <View className="bg-background">
        <SafeAreaView edges={['bottom']}>
          <View className="gap-3 px-6 py-4">
            <Body tone="muted" className="text-center">
              Point the camera at the QR code in the web app&apos;s settings.
            </Body>
            <Button variant="ghost" onPress={() => router.back()}>
              Cancel
            </Button>
          </View>
        </SafeAreaView>
      </View>
    </View>
  )
}
