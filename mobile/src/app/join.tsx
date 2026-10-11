import { useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OpenDays, useOpenDays } from '../components/OpenDays';
import { colours, space } from '../theme';

export default function Join() {
  const { days, error, load } = useOpenDays();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colours.background }} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colours.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <OpenDays days={days} error={error} />
      </ScrollView>
    </SafeAreaView>
  );
}
