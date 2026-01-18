
import { GoogleGenAI, Type } from "@google/genai";
import { BoardElement } from "../types";

// Always use named parameter for apiKey
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export async function summarizeMeeting(messages: string[]) {
  // Use 'gemini-3-flash-preview' for basic text tasks
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Summarize this meeting transcript and list key action items: ${messages.join('\n')}`,
    config: {
      thinkingConfig: { thinkingBudget: 0 }
    }
  });
  // Access the .text property directly
  return response.text;
}

export async function optimizeBoard(elements: BoardElement[]): Promise<Partial<BoardElement>[]> {
  const simplified = elements.map(e => ({ id: e.id, type: e.type, x: e.x, y: e.y, content: e.content }));
  
  // Use 'gemini-3-pro-preview' for complex logic tasks
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Analyze these board elements and suggest improved positions (x, y) for better alignment and logical grouping. Return ONLY JSON array of {id, x, y}. Data: ${JSON.stringify(simplified)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER }
          },
          required: ["id", "x", "y"],
          propertyOrdering: ["id", "x", "y"]
        }
      }
    }
  });

  try {
    // Access the .text property directly
    const jsonStr = response.text?.trim() || '[]';
    return JSON.parse(jsonStr);
  } catch (e) {
    return [];
  }
}

/**
 * Uses Gemini to analyze a whiteboard image and convert messy drawings 
 * into structured board elements (rectangles, circles, and sticky notes).
 */
export async function beautifyBoard(base64Image: string): Promise<BoardElement[]> {
  const imagePart = {
    inlineData: {
      mimeType: 'image/png',
      data: base64Image,
    },
  };

  // Use 'gemini-3-flash-preview' for multimodal tasks
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        imagePart,
        { text: "Analyze this whiteboard sketch. Convert messy drawn shapes into clean geometric objects. For each shape, provide its type (rect, circle, or sticky), coordinates (x, y), dimensions (width, height), and a hex color. Return a JSON array." }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, description: "Type of the element: rect, circle, or sticky" },
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
            width: { type: Type.NUMBER },
            height: { type: Type.NUMBER },
            color: { type: Type.STRING, description: "Hex color code" },
            content: { type: Type.STRING, description: "Text content if any (especially for sticky notes)" }
          },
          required: ["type", "x", "y", "width", "height", "color"],
          propertyOrdering: ["type", "x", "y", "width", "height", "color", "content"]
        }
      }
    }
  });

  try {
    // Access the .text property directly
    const jsonStr = response.text?.trim() || '[]';
    const rawElements = JSON.parse(jsonStr);
    return rawElements.map((el: any) => ({
      ...el,
      id: Math.random().toString(36).substr(2, 9),
      userId: 'ai-beautifier',
      lastModified: Date.now()
    }));
  } catch (e) {
    console.error("Failed to parse beautify results", e);
    return [];
  }
}
