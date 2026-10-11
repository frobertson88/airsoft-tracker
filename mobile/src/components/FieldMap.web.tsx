// Web stand-in for FieldMap: the built-in maps only run in the phone app.
import { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FieldMapHandle, FieldMapProps } from './FieldMap';
import { colours, fonts, radius, space } from '../theme';

export type { FieldMapHandle, FieldMapProps } from './FieldMap';

export const FieldMap = forwardRef<FieldMapHandle, FieldMapProps>(function FieldMap({ data, style }, ref) {
  useImperativeHandle(ref, () => ({ goTo: () => {}, fit: () => {} }));
  return (
    <View style={[styles.box, style]}>
      <Text style={styles.title}>Map shows in the phone app</Text>
      <Text style={styles.body}>
        {data.boundary.length ? 'Boundary set' : 'No boundary yet'} · {data.areas.length}{' '}
        {data.areas.length === 1 ? 'area' : 'areas'} · {data.points.length}{' '}
        {data.points.length === 1 ? 'point' : 'points'}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    flex: 1,
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: colours.surface,
    borderColor: colours.border,
    borderWidth: 1,
    borderRadius: radius,
    padding: space.lg,
  },
  title: { color: colours.text, fontFamily: fonts.semibold, fontSize: 16 },
  body: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 14 },
});
