import * as React from 'react';

interface ColorPickerProps {
  currentColor: string;
  onColorChange: (color: string) => void;
}

const PRESET_COLORS = [
  { color: '#3B82F6', title: 'Blue' },
  { color: '#1D4ED8', title: 'Deep Blue' },
  { color: '#06B6D4', title: 'Cyan' },
  { color: '#10B981', title: 'Emerald' },
  { color: '#F59E0B', title: 'Amber' },
  { color: '#EF4444', title: 'Red' },
  { color: '#FFFFFF', title: 'White' },
  { color: '#1E293B', title: 'Dark Navy' },
];

// Get a random color that's not white or dark navy for better visibility
export function getRandomColor(): string {
  const colorfulColors = PRESET_COLORS.filter(c => c.color !== '#FFFFFF' && c.color !== '#1E293B');
  const randomIndex = Math.floor(Math.random() * colorfulColors.length);
  return colorfulColors[randomIndex].color;
}

export function ColorPicker({ currentColor, onColorChange }: ColorPickerProps) {
  const handlePresetClick = (color: string) => {
    onColorChange(color);
  };

  const handleClear = () => {
    // This will be handled by the parent component
  };

  return (
    <div className="color-controls">
      <div className="color-input">
        <label htmlFor="colorPicker" className="sr-only">
          Custom color
        </label>
        <input
          type="color"
          id="colorPicker"
          className="color-picker"
          value={currentColor}
          onChange={(e) => onColorChange(e.target.value)}
          aria-label="Choose custom color"
        />
      </div>

      <div
        className="color-presets"
        role="toolbar"
        aria-label="Color presets"
      >
        {PRESET_COLORS.map((preset) => (
          <button
            key={preset.color}
            className={`preset-btn ${currentColor === preset.color ? 'active' : ''}`}
            style={{ background: preset.color }}
            onClick={() => handlePresetClick(preset.color)}
            title={preset.title}
          />
        ))}
        <button
          className="preset-btn eraser"
          title="Eraser (Clear)"
          onClick={handleClear}
        />
      </div>
    </div>
  );
}
