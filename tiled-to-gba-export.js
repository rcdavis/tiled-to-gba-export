/*
 * tiled-to-gba-export.js
 *
 * This extension adds the "GBA source files - regular" type to the "Export As" menu,
 * which generates tile arrays that can be loaded directly into GBA VRAM for
 * use as regular (not affine) tiled backgrounds.
 *
 * Valid map sizes for GBA are 32x32, 64x32, 32x64 and 64x64, but this extension
 * allows you to export maps of any size as long as the width and height are a
 * mulitple of 32.
 *
 * Each tile layer is parsed in 32x32 chunks (a screenblock on GBA) and converted
 * to a C array of hexadecimal tile IDs - blank tiles are defaulted to 0x0000.
 * For example, 64x64 maps are parsed as four screenblocks like this:
 *
 *                        Array 1
 *                         +---+
 * Tile layer 1 64x64      | 0 |
 *     +---+---+           +---+
 *     | 0 | 1 |           | 1 |
 *     +---+---+     >     +---+
 *     | 2 | 3 |           | 2 |
 *     +---+---+           +---+
 *                         | 3 |
 *                         +---+
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

tiled.registerMapFormat("gba", {
    name: "GBA source files - regular",
    extension: "c *.h",
    write: function(p_map, p_fileName) {
        // Only allow valid map sizes to be parsed
        if (p_map.width % 32 != 0 || p_map.height % 32 != 0) {
            return "Export failed: Invalid map size! Map width and height must be a multiple of 32.";
        }

        // Standard screenblock size for GBA
        const SCREENBLOCKWIDTH = 32;
        const SCREENBLOCKHEIGHT = 32;

        // Split full filename path into the filename (without extension) and the directory
        const fileBaseName = FileInfo.completeBaseName(p_fileName).replace(/[^a-zA-Z0-9-_]/g, "_");
        var filePath = FileInfo.path(p_fileName)+"/";

        // Replace the ‘/’ characters in the file path for ‘\’ on Windows
        filePath = FileInfo.toNativeSeparators(filePath);

        const tilemapLength = p_map.width * p_map.height;

        // Header defines
        var headerFileData = `#ifndef _${fileBaseName.toUpperCase()}_H_\n`;
        headerFileData += `#define _${fileBaseName.toUpperCase()}_H_\n\n`;

        headerFileData += `#define ${fileBaseName.toUpperCase()}_WIDTH ${p_map.width}\n`;
        headerFileData += `#define ${fileBaseName.toUpperCase()}_HEIGHT ${p_map.height}\n`;
        headerFileData += `#define ${fileBaseName.toUpperCase()}_LENGTH ${tilemapLength}\n\n`;
        headerFileData += "#ifdef __cplusplus\nextern \"C\" {\n#endif\n\n";

        var sourceFileData = `#include \"${fileBaseName}.h\"\n\n`;

        for (let i = 0; i < p_map.layerCount; ++i) {
            const currentLayer = p_map.layerAt(i);

            // Replace special characters for an underscore
            const currentLayerName = currentLayer.name.replace(/[^a-zA-Z0-9-_]/g, "_");

            headerFileData += `extern const unsigned short ${currentLayerName}[${tilemapLength}];\n`;

            sourceFileData += `const unsigned short ${currentLayerName}[${tilemapLength}] __attribute__((aligned(4))) =\n`;
            sourceFileData += "{\n";

            const screenBlockCountX = currentLayer.width / SCREENBLOCKWIDTH;
            const screenBlockCountY = currentLayer.height / SCREENBLOCKHEIGHT;
            let screenBlockID = 0;

            if (currentLayer.isTileLayer) {
                for (let j = 0; j < screenBlockCountY; ++j) {
                    for (let k = 0; k < screenBlockCountX; ++k) {
                        sourceFileData += `    // Screeblock ${screenBlockID}\n`;
                        screenBlockID++;

                        for (let y = 0; y < SCREENBLOCKHEIGHT; ++y) {
                            // Indent array rows
                            sourceFileData += "    ";

                            for (let x = 0; x < SCREENBLOCKWIDTH; ++x) {
                                const currentTileX = x + (SCREENBLOCKWIDTH * k);
                                const currentTileY = y + (SCREENBLOCKHEIGHT * j);
                                const currentTile = currentLayer.cellAt(currentTileX, currentTileY);
                                var currentTileID = currentTile.tileId;

                                // Default to 0x0000 for blank tiles
                                if (currentTileID == "-1") {
                                    sourceFileData += "0x0000, ";
                                } else {
                                    if (currentTile.flippedHorizontally) {
                                        // Set the HFLIP bit for this screen entry
                                        currentTileID |= (1 << 10);
                                    }
                                    if (currentTile.flippedVertically) {
                                        // Set the VFLIP bit for this screen entry
                                        currentTileID |= (1 << 11);
                                    }

                                    sourceFileData += decimalToHex(currentTileID, 4) + ", ";
                                }
                            }

                            sourceFileData += "\n";
                        }

                        sourceFileData += "\n";
                    }
                }
            }

            // Remove the last comma and close the array.
            sourceFileData = `${sourceFileData.slice(0, -3)}\n};\n\n`;
        }

        headerFileData += "\n#ifdef __cplusplus\n}\n#endif\n";
        headerFileData += "\n#endif\n";

        // Remove the second newline at the end of the source file
        sourceFileData = sourceFileData.slice(0,-1);

        // Write header data to disk
        const headerFile = new TextFile(filePath+fileBaseName+".h", TextFile.WriteOnly);
        headerFile.write(headerFileData);
        headerFile.commit();
        tiled.log(`Tilemap exported to ${filePath}${fileBaseName}.h`);

        // Write source data to disk
        const sourceFile = new TextFile(filePath+fileBaseName+".c", TextFile.WriteOnly);
        sourceFile.write(sourceFileData);
        sourceFile.commit();
        tiled.log(`Tilemap exported to ${filePath}${fileBaseName}.c`);
    }
});
