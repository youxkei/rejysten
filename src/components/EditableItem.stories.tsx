import { type Meta, type StoryObj } from "@kachurun/storybook-solid-vite";
import { createSignal } from "solid-js";

import { EditableItem } from "@/components/EditableItem";

export default {
  title: "Components/EditableItem",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [item] = createSignal({ id: "1", text: "Press 'i' to edit this text" });
    const [isSelected] = createSignal(true);
    const [isEditing, setIsEditing] = createSignal(false);

    function handleSave(itemId: string, newText: string) {
      console.log(`Saving item ${itemId} with text: ${newText}`);
      // In a real app, this would save to a database
      return Promise.resolve();
    }

    return (
      <div style={{ padding: "20px", border: "1px solid #ccc", width: "400px" }}>
        <EditableItem
          item$={item}
          isSelected$={isSelected}
          isEditing$={isEditing}
          setIsEditing={setIsEditing}
          onSave={handleSave}
          selectedClassName="selected"
          editInputClassName="edit-input"
        />
        <p style={{ "margin-top": "20px", "font-size": "12px", color: "#666" }}>
          Keyboard shortcuts:
          <br />- Press 'i' to start editing
          <br />- Press 'Escape' to save and exit
          <br />- Text is auto-saved after 1 second of inactivity
        </p>
      </div>
    );
  },
};

export const NotSelected: Story = {
  render: () => {
    const [item] = createSignal({ id: "2", text: "This item is not selected" });
    const [isSelected] = createSignal(false);
    const [isEditing, setIsEditing] = createSignal(false);

    function handleSave(itemId: string, newText: string) {
      console.log(`Saving item ${itemId} with text: ${newText}`);
      return Promise.resolve();
    }

    return (
      <div style={{ padding: "20px", border: "1px solid #eee", width: "400px" }}>
        <EditableItem
          item$={item}
          isSelected$={isSelected}
          isEditing$={isEditing}
          setIsEditing={setIsEditing}
          onSave={handleSave}
        />
      </div>
    );
  },
};

export const WithCustomStyling: Story = {
  render: () => {
    const [item] = createSignal({ id: "3", text: "Custom styled item" });
    const [isSelected] = createSignal(true);
    const [isEditing, setIsEditing] = createSignal(false);

    function handleSave(itemId: string, newText: string) {
      console.log(`Saving item ${itemId} with text: ${newText}`);
      return Promise.resolve();
    }

    return (
      <>
        <style>{`
          .custom-item {
            padding: 10px;
            border-radius: 4px;
            transition: background-color 0.2s;
          }
          .custom-selected {
            background-color: #e3f2fd;
            border: 1px solid #2196f3;
          }
          .custom-input {
            width: 100%;
            padding: 8px;
            border: 2px solid #2196f3;
            border-radius: 4px;
            font-size: 14px;
            outline: none;
          }
        `}</style>
        <div style={{ width: "400px" }}>
          <EditableItem
            item$={item}
            isSelected$={isSelected}
            isEditing$={isEditing}
            setIsEditing={setIsEditing}
            onSave={handleSave}
            className="custom-item"
            selectedClassName="custom-selected"
            editInputClassName="custom-input"
          />
        </div>
      </>
    );
  },
};
