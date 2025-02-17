/*
 * tiled-to-gba-export-affine.js
 *
 * This extension adds the "GBA source files - affine" type to the "Export As" menu,
 * which generates tile arrays that can be loaded directly into GBA VRAM for
 * use as affine tiled backgrounds.
 *
 * Valid affine map sizes are 16x16, 32x32, 64x64 and 128x128.
 *
 * Each tile layer is converted to a C array of hexadecimal tile IDs - blank
 * tiles are defaulted to 0x0000.
 *
 * Copyright (c) 2020 Jay van Hutten
 * Copyright (c) 2025 Ren Davis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */

/* global FileInfo, TextFile, tiled */

function decimalToHex(p_decimal, p_padding) {
    return "0x" + p_decimal
        .toString(16)
        .toUpperCase()
        .padStart(p_padding, "0");
}

const customMapFormat = {
    name: "GBA source files - affine",
    extension: "c *.h",
    write: function(p_map, p_fileName) {
        console.time("Export completed in");

        // Only allow valid map sizes to be parsed
        if (!((p_map.width == 16 && p_map.height == 16)
            || (p_map.width == 32 && p_map.height == 32)
            || (p_map.width == 64 && p_map.height == 64)
            || (p_map.width == 128 && p_map.height == 128))) {
            return "Invalid map size! Map must be 16x16, 32x32, 64x64 or 128x128 in size.";
        }

        // Split full filename path into the filename (without extension) and the directory
        const fileBaseName = FileInfo.completeBaseName(p_fileName).replace(/[^a-zA-Z0-9-_]/g, "_");
        var filePath = FileInfo.path(p_fileName)+"/";

        // Replace the ‘/’ characters in the file path for ‘\’ on Windows
        filePath = FileInfo.toNativeSeparators(filePath);

        const tilemapLength = p_map.width * p_map.height;

        var headerFileData = "#ifndef _"+fileBaseName.toUpperCase()+"_H_\n";
        headerFileData += "#define _"+fileBaseName.toUpperCase()+"_H_\n\n";
        headerFileData += "#define "+fileBaseName.toUpperCase()+"_WIDTH  ("+p_map.width+")\n";
        headerFileData += "#define "+fileBaseName.toUpperCase()+"_HEIGHT ("+p_map.height+")\n";
        headerFileData += "#define "+fileBaseName.toUpperCase()+"_LENGTH ("+tilemapLength+")\n\n";
        headerFileData += "#ifdef __cplusplus\nextern \"C\" {\n#endif\n\n";

        var sourceFileData = "#include \""+fileBaseName+".h\"\n\n";

        for (let i = 0; i < p_map.layerCount; ++i) {
            const currentLayer = p_map.layerAt(i);

            // Replace special characters for an underscore
            const currentLayerName = currentLayer.name.replace(/[^a-zA-Z0-9-_]/g, "_");

            headerFileData += "extern const unsigned short "+currentLayerName+"["+tilemapLength+"];\n";

            sourceFileData += "const unsigned short "+currentLayerName+"["+tilemapLength+"] __attribute__((aligned(4))) =\n";
            sourceFileData += "{\n";

            if (currentLayer.isTileLayer) {
                for (let y = 0; y < p_map.height; ++y) {
                    // Indent array rows
                    sourceFileData += "    ";

                    for (let x = 0; x < p_map.width; ++x) {
                        const currentTileID = currentLayer.cellAt(x, y).tileId;

                        // Default to 0x0000 for blank tiles
                        if (currentTileID == "-1") {
                            sourceFileData += "0x0000, ";
                        } else {
                            sourceFileData += decimalToHex(currentTileID, 4)+", ";
                        }
                    }

                    sourceFileData += "\n";
                }

                // Remove the last comma and close the array.
                sourceFileData = sourceFileData.slice(0,-3)+"\n};\n\n";
            }
        }

        headerFileData += "\n#ifdef __cplusplus\n}\n#endif\n";
        headerFileData += "\n#endif\n";

        // Remove the second newline at the end of the source file
        sourceFileData = sourceFileData.slice(0,-1);

        // Write header data to disk
        const headerFile = new TextFile(filePath+fileBaseName+".h", TextFile.WriteOnly);
        headerFile.write(headerFileData);
        headerFile.commit();
        console.log("Tilemap exported to "+filePath+fileBaseName+".h");

        // Write source data to disk
        const sourceFile = new TextFile(filePath+fileBaseName+".c", TextFile.WriteOnly);
        sourceFile.write(sourceFileData);
        sourceFile.commit();
        console.log("Tilemap exported to "+filePath+fileBaseName+".c");

        console.timeEnd("Export completed in");
    }
}

tiled.registerMapFormat("gba-affine", customMapFormat)
