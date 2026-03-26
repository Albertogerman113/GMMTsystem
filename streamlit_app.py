import streamlit as st
import streamlit.components.v1 as components
import os

# 1. Configuración de la página (Título en la pestaña del navegador)
st.set_page_config(
    page_title="Grupo Mas Tablaroca v2.5",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# 2. Estilo CSS para ocultar el menú de Streamlit y que tu App sea la protagonista
st.markdown("""
    <style>
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    .block-container {
        padding-top: 0rem;
        padding-bottom: 0rem;
        padding-left: 0rem;
        padding-right: 0rem;
    }
    </style>
    """, unsafe_allow_html=True)

# 3. Función para cargar tu app de React (compilada)
def main():
    # IMPORTANTE: Verifica si tu carpeta de compilación se llama 'dist' o 'build'
    # Si usas Vite es 'dist', si usas Create React App es 'build'
    build_path = "dist" 
    
    index_file = os.path.join(build_path, "index.html")

    if os.path.exists(index_file):
        with open(index_file, 'r', encoding='utf-8') as f:
            html_data = f.read()
            
        # Renderiza el HTML de tu app
        # El height=1000 es aproximado, puedes ajustarlo según tu diseño
        components.html(html_data, height=1000, scrolling=True)
    else:
        st.error(f"No se encontró el archivo index.html en la carpeta /{build_path}. "
                 "Asegúrate de haber ejecutado 'npm run build' y haber subido la carpeta a GitHub.")

if __name__ == "__main__":
    main()