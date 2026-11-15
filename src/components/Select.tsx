import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { C } from '../theme';
import { txt } from './ui';

/** Native replacement for the HTML <select> used in the original forms. */
export function Select({ label, value, options, placeholder, onChange, error }: {
  label: string; value: string; options: { value: string; label: string }[];
  placeholder?: string; onChange: (v: string) => void; error?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <View>
      <Text style={[txt(14, 'medium', C.slate700), { marginBottom: 6 }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: C.white, borderWidth: 1, borderColor: error ? C.red400 : C.slate200, borderRadius: 12,
          paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Text style={txt(14, 'regular', current ? C.slate700 : C.slate400)}>{current?.label ?? placeholder ?? 'Select'}</Text>
        <ChevronDown size={16} color={C.slate400} />
      </Pressable>
      {error ? <Text style={[txt(12, 'regular', C.red500), { marginTop: 4 }]}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' }}>
          <Pressable style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingBottom: 24 }}>
            <Text style={[txt(16, 'bold', C.navy), { padding: 20, paddingBottom: 8 }]}>{label}</Text>
            <ScrollView>
              {options.map(o => (
                <Pressable
                  key={o.value}
                  onPress={() => { onChange(o.value); setOpen(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.slate100 }}
                >
                  <Text style={txt(14, o.value === value ? 'semibold' : 'regular', o.value === value ? C.royal : C.slate700)}>{o.label}</Text>
                  {o.value === value ? <Check size={16} color={C.royal} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
