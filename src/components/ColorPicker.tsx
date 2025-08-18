import * as React from 'react';

interface ColorPickerProps {
  currentColor: string;
  onColorChange: (color: string) => void;
}

const PRESET_COLORS = [
  { color: '#FF0080', title: 'Hot Pink' },
  { color: '#0070F3', title: 'Blue' },
  { color: '#50E3C2', title: 'Cyan' },
  { color: '#7928CA', title: 'Purple' },
  { color: '#F5A623', title: 'Orange' },
  { color: '#79FFE1', title: 'Mint' },
  { color: '#FFFFFF', title: 'White' },
  { color: '#000000', title: 'Black' },
];

// Get a random color that's not white or black for better visibility
export function getRandomColor(): string {
  const colorfulColors = PRESET_COLORS.filter(c => c.color !== '#FFFFFF' && c.color !== '#000000');
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
