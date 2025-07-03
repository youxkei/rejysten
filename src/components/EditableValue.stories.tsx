import { type Meta, type StoryObj } from "@kachurun/storybook-solid-vite";
import { createSignal } from "solid-js";

import { EditableValue } from "@/components/EditableValue";

export default {
  title: "Components/EditableValue",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

type Story = StoryObj;

export const MultipleFields: Story = {
  render: () => {
    const fields = ["Text Field", "Start Time", "End Time"];
    const [values] = createSignal({
      text: "Sample text",
      startTime: "10:00",
      endTime: "11:30",
    });
    const [selectedIndex, setSelectedIndex] = createSignal(0);
    const [editingIndex, setEditingIndex] = createSignal(-1);

    function handleTabNavigation(fieldIndex: number, shiftKey: boolean) {
      if (shiftKey) {
        // Shift+Tab: go to previous field
        const nextIndex = fieldIndex > 0 ? fieldIndex - 1 : fields.length - 1;
        setEditingIndex(nextIndex);
      } else {
        // Tab: go to next field
        const nextIndex = fieldIndex < fields.length - 1 ? fieldIndex + 1 : 0;
        setEditingIndex(nextIndex);
      }
    }

    function handleSave(index: number, newValue: string) {
      console.log(`Saving field ${index} with value: ${newValue}`);
      return Promise.resolve();
    }

    return (
      <div style={{ padding: "20px", border: "1px solid #ccc", width: "400px" }}>
        <h3>Tab Navigation Demo</h3>
        <div style={{ display: "flex", "flex-direction": "column", gap: "10px", "margin-top": "20px" }}>
          <div>
            <label style={{ display: "block", "margin-bottom": "5px" }}>Text Field:</label>
            <EditableValue
              value={values().text}
              onSave={(newValue) => handleSave(0, newValue)}
              isSelected={selectedIndex() === 0}
              isEditing={editingIndex() === 0}
              setIsEditing={(editing) => setEditingIndex(editing ? 0 : -1)}
              toText={(val) => val}
              fromText={(text) => text}
              onTabPress={(shiftKey) => {
                handleTabNavigation(0, shiftKey);
              }}
              editInputClassName="edit-input"
            />
          </div>
          <div>
            <label style={{ display: "block", "margin-bottom": "5px" }}>Start Time:</label>
            <EditableValue
              value={values().startTime}
              onSave={(newValue) => handleSave(1, newValue)}
              isSelected={selectedIndex() === 1}
              isEditing={editingIndex() === 1}
              setIsEditing={(editing) => setEditingIndex(editing ? 1 : -1)}
              toText={(val) => val}
              fromText={(text) => text}
              onTabPress={(shiftKey) => {
                handleTabNavigation(1, shiftKey);
              }}
              editInputClassName="edit-input"
            />
          </div>
          <div>
            <label style={{ display: "block", "margin-bottom": "5px" }}>End Time:</label>
            <EditableValue
              value={values().endTime}
              onSave={(newValue) => handleSave(2, newValue)}
              isSelected={selectedIndex() === 2}
              isEditing={editingIndex() === 2}
              setIsEditing={(editing) => setEditingIndex(editing ? 2 : -1)}
              toText={(val) => val}
              fromText={(text) => text}
              onTabPress={(shiftKey) => {
                handleTabNavigation(2, shiftKey);
              }}
              editInputClassName="edit-input"
            />
          </div>
        </div>
        <p style={{ "margin-top": "20px", "font-size": "12px", color: "#666" }}>
          Keyboard shortcuts:
          <br />- Click on a field and press 'i' to start editing
          <br />- Press 'Tab' to go to the next field
          <br />- Press 'Shift+Tab' to go to the previous field
          <br />- Press 'Escape' to save and exit editing mode
        </p>
        <button
          style={{ "margin-top": "10px" }}
          onClick={() => {
            setSelectedIndex(0);
            setEditingIndex(-1);
          }}
        >
          Reset Selection
        </button>
      </div>
    );
  },
};

export const SingleField: Story = {
  render: () => {
    const [value] = createSignal("Click and press 'i' to edit");
    const [isSelected] = createSignal(true);
    const [isEditing, setIsEditing] = createSignal(false);

    function handleSave(newValue: string) {
      console.log(`Saving value: ${newValue}`);
      return Promise.resolve();
    }

    return (
      <div style={{ padding: "20px", border: "1px solid #ccc", width: "300px" }}>
        <EditableValue
          value={value()}
          onSave={handleSave}
          isSelected={isSelected()}
          isEditing={isEditing()}
          setIsEditing={setIsEditing}
          toText={(val) => val}
          fromText={(text) => text}
          editInputClassName="edit-input"
        />
        <p style={{ "margin-top": "20px", "font-size": "12px", color: "#666" }}>
          Press 'i' to start editing, 'Escape' to save and exit
        </p>
      </div>
    );
  },
};

export const WithCustomDisplay: Story = {
  render: () => {
    const [timestamp] = createSignal(Date.now());
    const [isSelected] = createSignal(true);
    const [isEditing, setIsEditing] = createSignal(false);

    function handleSave(newValue: number) {
      console.log(`Saving timestamp: ${newValue}`);
      return Promise.resolve();
    }

    function formatDate(ts: number): string {
      return new Date(ts).toLocaleTimeString();
    }

    function parseDate(text: string): number | undefined {
      try {
        const [hours, minutes, seconds] = text.split(":");
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds || "0"));
        return date.getTime();
      } catch {
        return undefined;
      }
    }

    return (
      <div style={{ padding: "20px", border: "1px solid #ccc", width: "300px" }}>
        <EditableValue
          value={timestamp()}
          onSave={handleSave}
          isSelected={isSelected()}
          isEditing={isEditing()}
          setIsEditing={setIsEditing}
          toText={formatDate}
          fromText={parseDate}
          displayComponent={(ts) => <span style={{ color: "#2196f3" }}>{formatDate(ts)}</span>}
          editInputClassName="edit-input"
        />
        <p style={{ "margin-top": "20px", "font-size": "12px", color: "#666" }}>
          Custom display component for timestamps
        </p>
      </div>
    );
  },
};
