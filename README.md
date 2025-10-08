# Pottery Rib Customizer

An interactive web-based tool for designing custom pottery ribs with real-time 3D preview and export functionality for 3D printing.

Access it here: https://michelleoraaali.github.io/pottery-rib-designer/

## Features

### Core Functionality
- **Real-time 3D Preview**: Interactive Three.js-powered visualization with orbit controls
- **Multiple View Modes**: Switch between 3D, top, side, and cross-section views
- **Export Options**: Download your design as STL or OBJ files for 3D printing

### Customization Options

#### Basic Dimensions
- Length (50-200mm)
- Width (30-100mm)
- Thickness (3-12mm)
- Material-specific thickness suggestions (PLA, PETG, TPU)

#### Shape Options
- Rectangular
- Oval
- Circle
- Teardrop
- Kidney Bean
- Asymmetric Teardrop
- Custom drawn shapes with smoothing control

#### Edge Properties
- **Edge Thickness**: Independent control from 0.1-12mm
- **Edge Profile Types**: Straight, Sharp, Bevel, Miter, Fully Rounded, Custom Angle
- **Asymmetric Control**: Different settings for each edge (top, bottom, left, right)
- **Edge Depth**: Control how far edge modifications extend (3-30mm)

#### Other Features
- **Longitudinal Curve**: Add a bow along the length to conform to curved pottery surfaces
- **Quick Presets**: Six pre-configured designs for common use cases
- **Design Statistics**: Real-time volume, weight, and surface area calculations
- **3D Printing Tips**: Built-in guidance for optimal printing settings

## Live Demo

[View Live Demo](https://michelleoraaali.github.io/pottery-rib-designer/)

## Technology Stack

- **HTML5**: Semantic markup and structure
- **CSS3**: Modern styling with flexbox/grid layouts
- **JavaScript (ES6+)**: Core application logic
- **Three.js (r128)**: 3D rendering and geometry manipulation
- **Bootstrap 5**: UI components and responsive layout
- **Font Awesome 6**: Icon library

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Requires WebGL support for 3D rendering.

## Usage Guide

### Creating a Custom Rib

1. **Choose a Preset** (optional): Start with a pre-configured design
2. **Adjust Dimensions**: Set length, width, and thickness
3. **Select Shape**: Choose from predefined shapes or draw custom
4. **Configure Edges**: Set edge thickness, profile type, and depth
5. **Add Curve** (optional): Apply longitudinal bow for curved surfaces
6. **Preview**: Use orbit controls to view from all angles
7. **Export**: Download as STL for 3D printing

### Drawing Custom Shapes

1. Select "Draw Custom Shaping Edge" from Shape Type
2. Click "Open Drawing Canvas"
3. Draw your desired curve from left to right
4. Adjust smoothing amount if needed
5. Click "Apply Shape"

### Asymmetric Edge Control

For different edge properties on each side:

1. **Edge Thickness**: Select "Asymmetric (Custom per Edge)"
2. **Edge Profile**: Select "Asymmetric (Custom per Edge)"
3. Configure each edge independently in the grid controls

## 3D Printing Tips

### Recommended Settings
- **Layer Height**: 0.2mm (standard) or 0.1mm (smooth)
- **Infill**: 20-30%
- **Orientation**: Flat on build plate (unless using longitudinal curve)

### Material Recommendations
- **PLA**: Best for rigid ribs, easy to print
- **PETG**: More durable, semi-flexible
- **TPU**: For flexible ribs (increase thickness by 2-4mm)

### Important Notes
- Edge thickness below 0.5mm requires fine nozzle (0.3mm or smaller)
- Test with small models before full-size prints
- Post-process edges with sandpaper for smoothest finish

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- Three.js community for excellent 3D rendering library
- Bootstrap team for responsive UI framework
- Font Awesome for icon library

## Support

If you encounter any issues or have questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review the code comments for detailed explanations

## Future Enhancements

Potential features for future versions:
- Save/load designs to browser storage
- More preset configurations
- Texture/pattern options
- Multiple material calculations
- Incorporating a grip hole
- Advanced export options (3MF, STEP)

---

Made with ❤️ for the pottery community
