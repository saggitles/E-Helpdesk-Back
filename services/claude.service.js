// services/claude.service.js
const Anthropic = require('@anthropic-ai/sdk'); 

const anthropic = new Anthropic({
//   apiKey: process.env.ANTHROPIC_API_KEY, // You'll need to set this in your .env
     apiKey: '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'
});

exports.chatCompletion = async (message, context = {}) => {
  try {
    const response = await anthropic.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: message
      }],
      system: `You are an AI assistant for E-Helpdesk, specifically trained on FleetIQ telematics devices and forklift management. 
              Current context: ${JSON.stringify(context)}`
    });
    return response.content[0].text;
  } catch (error) {
    console.error('Claude API Error:', error);
    throw new Error('Failed to get response from Claude');
  }
};