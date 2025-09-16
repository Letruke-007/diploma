import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div>
      <h1>My Cloud</h1>
      <div className="panel" style={{ padding: 16 }}>
        <p>Простое облачное хранилище: загружайте, скачивайте, переименовывайте и делитесь файлами через публичные ссылки.</p>
        <p className="mt-12">
          <Link to="/register" className="btn btn--secondary">Зарегистрироваться</Link>
          <span style={{ margin: '0 8px' }}>или</span>
          <Link to="/login" className="btn">Войти</Link>
        </p>
      </div>
    </div>
  )
}
