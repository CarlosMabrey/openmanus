// JavaScript for the photography portfolio website

// Function to load Instagram posts
function loadInstagramPosts() {
    // This is a placeholder. You'll need to use the Instagram Basic Display API
    console.log('Loading Instagram posts...');
    // Implement the API call and DOM manipulation here
}

// Function to initialize the image gallery
function initGallery() {
    const gallery = document.querySelector('.gallery');
    if (gallery) {
        // Add click event listeners to open images in a lightbox
        gallery.addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG') {
                openLightbox(e.target.src);
            }
        });
    }
}

// Function to open the lightbox
function openLightbox(imageSrc) {
    const lightbox = document.createElement('div');
    lightbox.classList.add('lightbox');
    lightbox.innerHTML = `
        <div class="lightbox-content">
            <img src="${imageSrc}" alt="Enlarged photo">
            <button class="close-lightbox">&times;</button>
        </div>
    `;
    document.body.appendChild(lightbox);

    // Close lightbox when clicking the close button or outside the image
    lightbox.addEventListener('click', (e) => {
        if (e.target.classList.contains('lightbox') || e.target.classList.contains('close-lightbox')) {
            document.body.removeChild(lightbox);
        }
    });
}

// Function to handle the contact form submission
function handleContactForm() {
    const form = document.querySelector('#contact-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            // Implement form validation and submission logic here
            console.log('Form submitted');
            // You can use AJAX to send the form data to a server
        });
    }
}

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    loadInstagramPosts();
    initGallery();
    handleContactForm();
});
