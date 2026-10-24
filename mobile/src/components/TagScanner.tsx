// Full-screen camera for reading a tag's QR code outside the Scan tab, e.g. to
// add a spare tag to a point or walk the field checking every code reads.
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colours, fonts, radius, space } from '../theme';
import { Body, Button } from './ui';

export function TagScanner({
  title,
  message,
  onCode,
  onClose,
}: {
  title: string;
  /** The last result or problem, shown under the title. */
  message?: string;
  /** Called once per code; scanning pauses until it settles. */
  onCode: (text: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  // The camera reports the same code many times a second; take one at a time,
  // and ignore the code just handled for a moment so it isn't read twice.
  const busy = useRef(false);
  const last = useRef({ text: '', at: 0 });

  const onScan = async (text: string) => {
    if (busy.current) return;
    if (text === last.current.text && Date.now() - last.current.at < 3000) return;
    busy.current = true;
    try {
      await onCode(text);
    } finally {
      last.current = { text, at: Date.now() };
      busy.current = false;
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {permission?.granted ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={(e) => onScan(e.data)}
            />
            <View style={styles.frame} pointerEvents="none" />
          </>
        ) : (
          <SafeAreaView style={styles.ask}>
            <Body>The camera reads the QR code on the tag.</Body>
            {permission && <Button title="Allow camera" onPress={requestPermission} />}
            {permission && !permission.canAskAgain && (
              <Body muted>Turn the camera on for this app in your phone’s settings.</Body>
            )}
          </SafeAreaView>
        )}
        <SafeAreaView edges={['bottom']} style={styles.panelWrap} pointerEvents="box-none">
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{title}</Text>
            {!!message && <Text style={styles.panelText}>{message}</Text>}
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.close}>
              <Text style={styles.closeText}>Done</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  ask: { flex: 1, padding: space.lg, gap: space.md, justifyContent: 'center', backgroundColor: colours.background },
  frame: {
    position: 'absolute',
    alignSelf: 'center',
    top: '22%',
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: colours.accent,
    borderRadius: radius,
  },
  panelWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panel: {
    margin: space.md,
    padding: space.md,
    gap: space.xs,
    borderRadius: radius,
    backgroundColor: 'rgba(11,16,12,0.92)',
    borderWidth: 1,
    borderColor: colours.border,
  },
  panelTitle: { color: colours.text, fontFamily: fonts.semibold, fontSize: 16 },
  panelText: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 15 },
  close: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm },
  closeText: { color: colours.accent, fontFamily: fonts.semibold, fontSize: 16 },
});
