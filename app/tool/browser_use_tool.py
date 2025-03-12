import asyncio
import json
from typing import Optional

from browser_use import Browser as BrowserUseBrowser
from browser_use import BrowserConfig
from browser_use.browser.context import BrowserContext
from browser_use.dom.service import DomService
from pydantic import Field, field_validator
from pydantic_core.core_schema import ValidationInfo

from app.tool.base import BaseTool, ToolResult


_BROWSER_DESCRIPTION = """
Interact with a web browser to perform various actions such as navigation, element interaction,
content extraction, and tab management. Supported actions include:
- 'navigate': Go to a specific URL
- 'click': Click an element by index
- 'input_text': Input text into an element
- 'screenshot': Capture a screenshot
- 'get_html': Get page HTML content
- 'execute_js': Execute JavaScript code
- 'scroll': Scroll the page
- 'switch_tab': Switch to a specific tab
- 'new_tab': Open a new tab
- 'close_tab': Close the current tab
- 'refresh': Refresh the current page
"""


class BrowserUseTool(BaseTool):
    name: str = "browser_use"
    description: str = _BROWSER_DESCRIPTION
    parameters: dict = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "navigate",
                    "click",
                    "input_text",
                    "screenshot",
                    "get_html",
                    "execute_js",
                    "scroll",
                    "switch_tab",
                    "new_tab",
                    "close_tab",
                    "refresh",
                ],
                "description": "The browser action to perform",
            },
            "url": {
                "type": "string",
                "description": "URL for 'navigate' or 'new_tab' actions",
            },
            "index": {
                "type": "integer",
                "description": "Element index for 'click' or 'input_text' actions",
            },
            "text": {"type": "string", "description": "Text for 'input_text' action"},
            "script": {
                "type": "string",
                "description": "JavaScript code for 'execute_js' action",
            },
            "scroll_amount": {
                "type": "integer",
                "description": "Pixels to scroll (positive for down, negative for up) for 'scroll' action",
            },
            "tab_id": {
                "type": "integer",
                "description": "Tab ID for 'switch_tab' action",
            },
        },
        "required": ["action"],
        "dependencies": {
            "navigate": ["url"],
            "click": ["index"],
            "input_text": ["index", "text"],
            "execute_js": ["script"],
            "switch_tab": ["tab_id"],
            "new_tab": ["url"],
            "scroll": ["scroll_amount"],
        },
    }

    lock: asyncio.Lock = Field(default_factory=asyncio.Lock)
    browser: Optional[BrowserUseBrowser] = Field(default=None, exclude=True)
    context: Optional[BrowserContext] = Field(default=None, exclude=True)
    dom_service: Optional[DomService] = Field(default=None, exclude=True)

    # Add a flag to track if we're in mock mode
    mock_mode: bool = Field(default=False, exclude=True)
    mock_reason: str = Field(default="", exclude=True)

    @field_validator("parameters", mode="before")
    def validate_parameters(cls, v: dict, info: ValidationInfo) -> dict:
        if not v:
            raise ValueError("Parameters cannot be empty")
        return v

    async def _ensure_browser_initialized(self) -> BrowserContext:
        """Ensure browser and context are initialized."""
        # If already in mock mode, don't try to initialize real browser
        if self.mock_mode:
            raise RuntimeError(f"Browser in mock mode: {self.mock_reason}")
            
        try:
            if self.browser is None:
                try:
                    self.browser = BrowserUseBrowser(BrowserConfig(headless=False))
                except NotImplementedError:
                    # Handle the NotImplementedError from asyncio subprocess
                    self.mock_mode = True
                    self.mock_reason = "Python asyncio subprocess not supported in this environment (common with Python 3.12+ on Windows)"
                    raise RuntimeError(
                        "Browser initialization failed: Python asyncio subprocess not supported in this environment. "
                        "This commonly happens in Python 3.12+ on Windows. Try using Python 3.11 or earlier."
                    )
                except Exception as e:
                    # Handle any other initialization errors
                    self.mock_mode = True
                    self.mock_reason = f"Browser initialization error: {str(e)}"
                    raise RuntimeError(f"Browser initialization failed: {str(e)}")
                    
            if self.context is None:
                try:
                    self.context = await self.browser.new_context()
                    self.dom_service = DomService(await self.context.get_current_page())
                except Exception as e:
                    # Handle context initialization errors
                    self.mock_mode = True
                    self.mock_reason = f"Browser context initialization error: {str(e)}"
                    if self.browser:
                        try:
                            await self.browser.close()
                        except:
                            pass
                    self.browser = None
                    raise RuntimeError(f"Browser context initialization failed: {str(e)}")
                    
            return self.context
        except Exception as e:
            # If any error occurs during initialization, switch to mock mode
            self.mock_mode = True
            if not self.mock_reason:
                self.mock_reason = f"Unexpected error: {str(e)}"
            raise

    async def execute(
        self,
        action: str,
        url: Optional[str] = None,
        index: Optional[int] = None,
        text: Optional[str] = None,
        script: Optional[str] = None,
        scroll_amount: Optional[int] = None,
        tab_id: Optional[int] = None,
        **kwargs,
    ) -> ToolResult:
        """
        Execute a specified browser action.

        Args:
            action: The browser action to perform
            url: URL for navigation or new tab
            index: Element index for click or input actions
            text: Text for input action
            script: JavaScript code for execution
            scroll_amount: Pixels to scroll for scroll action
            tab_id: Tab ID for switch_tab action
            **kwargs: Additional arguments

        Returns:
            ToolResult with the action's output or error
        """
        try:
            async with self.lock:
                # Normalize the action name (handle aliases)
                action = action.lower().strip()
                if action == "get_content":
                    action = "get_html"  # Map get_content to get_html
                
                try:
                    # Try to initialize the browser
                    context = await self._ensure_browser_initialized()
                except Exception as e:
                    # If initialization fails, use mock mode
                    return self._handle_mock_action(action, url, index, text, script, scroll_amount, tab_id, **kwargs)
                
                # Continue with normal browser actions...
                if action == "navigate":
                    if not url:
                        return ToolResult(error="URL is required for 'navigate' action")
                    await context.navigate_to(url)
                    return ToolResult(output=f"Navigated to {url}")

                elif action == "click":
                    if index is None:
                        return ToolResult(error="Index is required for 'click' action")
                    element = await context.get_dom_element_by_index(index)
                    if not element:
                        return ToolResult(error=f"Element with index {index} not found")
                    download_path = await context._click_element_node(element)
                    output = f"Clicked element at index {index}"
                    if download_path:
                        output += f" - Downloaded file to {download_path}"
                    return ToolResult(output=output)

                elif action == "input_text":
                    if index is None or not text:
                        return ToolResult(
                            error="Index and text are required for 'input_text' action"
                        )
                    element = await context.get_dom_element_by_index(index)
                    if not element:
                        return ToolResult(error=f"Element with index {index} not found")
                    await context._input_text_element_node(element, text)
                    return ToolResult(
                        output=f"Input '{text}' into element at index {index}"
                    )

                elif action == "screenshot":
                    screenshot = await context.take_screenshot(full_page=True)
                    return ToolResult(
                        output=f"Screenshot captured (base64 length: {len(screenshot)})",
                        system=screenshot,
                    )

                elif action == "get_html":
                    html = await context.get_page_html()
                    truncated = html[:2000] + "..." if len(html) > 2000 else html
                    return ToolResult(output=truncated)

                elif action == "execute_js":
                    if not script:
                        return ToolResult(
                            error="Script is required for 'execute_js' action"
                        )
                    result = await context.execute_javascript(script)
                    return ToolResult(output=str(result))

                elif action == "scroll":
                    if scroll_amount is None:
                        return ToolResult(
                            error="Scroll amount is required for 'scroll' action"
                        )
                    await context.execute_javascript(
                        f"window.scrollBy(0, {scroll_amount});"
                    )
                    direction = "down" if scroll_amount > 0 else "up"
                    return ToolResult(
                        output=f"Scrolled {direction} by {abs(scroll_amount)} pixels"
                    )

                elif action == "switch_tab":
                    if tab_id is None:
                        return ToolResult(
                            error="Tab ID is required for 'switch_tab' action"
                        )
                    await context.switch_to_tab(tab_id)
                    return ToolResult(output=f"Switched to tab {tab_id}")

                elif action == "new_tab":
                    if not url:
                        return ToolResult(error="URL is required for 'new_tab' action")
                    await context.create_new_tab(url)
                    return ToolResult(output=f"Opened new tab with URL {url}")

                elif action == "close_tab":
                    await context.close_current_tab()
                    return ToolResult(output="Closed current tab")

                elif action == "refresh":
                    await context.refresh_page()
                    return ToolResult(output="Refreshed current page")

                else:
                    return ToolResult(error=f"Unknown action: {action}")

        except Exception as e:
            # If any error occurs during execution, switch to mock mode for next time
            self.mock_mode = True
            if not self.mock_reason:
                self.mock_reason = f"Browser action error: {str(e)}"
            return ToolResult(error=f"Browser action '{action}' failed: {str(e)}. Using simulated browser mode for future requests.")

    def _handle_mock_action(
        self,
        action: str,
        url: Optional[str] = None,
        index: Optional[int] = None,
        text: Optional[str] = None,
        script: Optional[str] = None,
        scroll_amount: Optional[int] = None,
        tab_id: Optional[int] = None,
        **kwargs,
    ) -> ToolResult:
        """Handle browser actions in mock mode when actual browser can't be initialized."""
        self.mock_mode = True  # Ensure we're in mock mode
        
        # Provide sensible simulated responses for supported actions
        if action == "navigate":
            if not url:
                return ToolResult(error="URL is required for 'navigate' action")
                
            # Extract the domain from the URL for inclusion in the response
            import re
            domain = re.search(r'https?://([^/]+)', url)
            domain_text = domain.group(1) if domain else "the website"
            
            return ToolResult(
                output=f"[SIMULATED BROWSING] Navigation to: {url}\n\n"
                       f"The browser tool is running in simulation mode due to: {self.mock_reason}\n\n"
                       f"Would have navigated to {domain_text}. To view actual content from this URL, please:\n"
                       f"1. Use the google_search tool to find information about this site\n"
                       f"2. Try running this application with Python 3.11 instead of 3.12+\n"
                       f"3. Or try running on Linux/macOS where asyncio works better with Playwright"
            )
            
        elif action == "get_html":
            return ToolResult(
                output=f"[SIMULATED BROWSING] Would get HTML content from the current page.\n\n"
                       f"The browser tool is running in simulation mode due to: {self.mock_reason}\n\n"
                       f"To view actual web content, please try using the google_search tool instead."
            )
            
        elif action == "screenshot":
            return ToolResult(
                output=f"[SIMULATED BROWSING] Would capture a screenshot of the current page.\n\n"
                       f"The browser tool is running in simulation mode due to: {self.mock_reason}\n\n"
                       f"Screenshots are not available in simulation mode."
            )
            
        elif action == "click":
            if index is None:
                return ToolResult(error="Index is required for 'click' action")
                
            return ToolResult(
                output=f"[SIMULATED BROWSING] Would click element at index {index}.\n\n"
                       f"The browser tool is running in simulation mode due to: {self.mock_reason}"
            )
            
        elif action == "input_text":
            if index is None or not text:
                return ToolResult(error="Index and text are required for 'input_text' action")
                
            return ToolResult(
                output=f"[SIMULATED BROWSING] Would input '{text}' into element at index {index}.\n\n"
                       f"The browser tool is running in simulation mode due to: {self.mock_reason}"
            )
            
        elif action == "execute_js":
            if not script:
                return ToolResult(error="Script is required for 'execute_js' action")
                
            return ToolResult(
                output=f"[SIMULATED BROWSING] Would execute JavaScript: '{script[:50]}...'.\n\n"
                       f"The browser tool is running in simulation mode due to: {self.mock_reason}"
            )
            
        else:
            return ToolResult(
                output=f"[SIMULATED BROWSING] The '{action}' action is not available in simulation mode.\n\n"
                       f"The browser tool is running in simulation mode due to: {self.mock_reason}\n\n"
                       f"Please try using the google_search tool as an alternative."
            )

    async def get_current_state(self) -> ToolResult:
        """Get the current browser state as a ToolResult."""
        async with self.lock:
            try:
                context = await self._ensure_browser_initialized()
                state = await context.get_state()
                state_info = {
                    "url": state.url,
                    "title": state.title,
                    "tabs": [tab.model_dump() for tab in state.tabs],
                    "interactive_elements": state.element_tree.clickable_elements_to_string(),
                }
                return ToolResult(output=json.dumps(state_info))
            except Exception as e:
                return ToolResult(error=f"Failed to get browser state: {str(e)}")

    async def cleanup(self):
        """Clean up browser resources."""
        async with self.lock:
            if self.context is not None:
                await self.context.close()
                self.context = None
                self.dom_service = None
            if self.browser is not None:
                await self.browser.close()
                self.browser = None

    def __del__(self):
        """Ensure cleanup when object is destroyed."""
        if self.browser is not None or self.context is not None:
            try:
                asyncio.run(self.cleanup())
            except RuntimeError:
                loop = asyncio.new_event_loop()
                loop.run_until_complete(self.cleanup())
                loop.close()
